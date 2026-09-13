import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import { startMicrophoneCapture } from '../src/services/microphoneCapture.ts'

const deferred = () => {
  let resolve, reject
  const promise = new Promise((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const makeTrack = () => ({
  kind: 'audio', readyState: 'live',
  stop() { this.readyState = 'ended' },
})
const makeStream = (track) => ({ getTracks: () => [track], getAudioTracks: () => [track] })

test('capture starts immediately and releases the microphone when cancelled', async () => {
  const track = makeTrack()
  let requested
  const capture = startMicrophoneCapture({ echoCancellation: true }, (constraints) => {
    requested = constraints
    return Promise.resolve(makeStream(track))
  })
  assert.deepEqual(requested, { audio: { echoCancellation: true }, video: false })
  assert.equal((await capture.result).track, track)
  capture.cancel()
  assert.equal(track.readyState, 'ended')
})

test('permission granted after leave or timeout stops every late track', async () => {
  const pending = deferred()
  const track = makeTrack()
  const capture = startMicrophoneCapture({}, () => pending.promise)
  capture.cancel()
  pending.resolve(makeStream(track))
  assert.equal((await capture.result).track, null)
  assert.equal(track.readyState, 'ended')
})

test('denied permission is handled while authorization is still pending', async () => {
  const error = new DOMException('Denied', 'NotAllowedError')
  const capture = startMicrophoneCapture({}, () => Promise.reject(error))
  assert.deepEqual(await capture.result, { track: null, error })
  capture.cancel()
})

// Exercise the installed SDK, including the patch applied by npm ci. Only the
// browser/mediasoup boundary is replaced; participant and room logic are real.
mock.module('mediasoup-client', {
  namedExports: {
    Device: class {
      async load() {}
      createSendTransport() { return { on() {}, close: mock.fn() } }
      createRecvTransport() { return { on() {}, close: mock.fn() } }
    },
  },
})
const { Room, LocalParticipant, Track, RoomEvent } = await import('@gunns-dev/control-tower-client')
const { Signal } = await import('../node_modules/@gunns-dev/control-tower-client/dist/signal.js')

test('explicit leave sends a distinct close code and waits for the socket handshake', async (t) => {
  const original = globalThis.WebSocket
  class Socket extends EventTarget {
    static OPEN = 1
    static CLOSED = 3
    static latest
    readyState = 1
    constructor() { super(); Socket.latest = this }
    close(code, reason) { this.closeRequest = { code, reason } }
  }
  globalThis.WebSocket = Socket
  t.after(() => { globalThis.WebSocket = original })
  const signal = new Signal()
  const connected = signal.connect('ws://example.test', 'test')
  const socket = Socket.latest
  socket.onmessage({ data: JSON.stringify({ t: 'notify', method: 'welcome', data: {} }) })
  await connected
  let completed = false
  const closing = signal.close(4000, 'CLIENT_LEAVE').then(() => { completed = true })
  await Promise.resolve()
  assert.equal(completed, false)
  assert.equal(signal.isOpen, false)
  assert.deepEqual(socket.closeRequest, { code: 4000, reason: 'CLIENT_LEAVE' })
  socket.dispatchEvent(new Event('close'))
  await closing
  assert.equal(completed, true)
})

test('pre-captured audio publishes without opening a second microphone', async () => {
  const participant = new LocalParticipant('peer', 'identity', 'name', '', {})
  const track = makeTrack()
  const produce = mock.fn(async () => ({ id: 'producer', pause() { track.enabled = false }, resume() { track.enabled = true } }))
  const emit = mock.fn()
  const request = mock.fn(async () => {})
  participant._init(request, { produce }, emit)
  const publication = await participant.publishTrack(track, { source: Track.Source.Microphone })
  assert.equal(produce.mock.calls[0].arguments[0].track, track)
  assert.equal(participant.isMicrophoneEnabled, true)
  assert.equal(publication.track.mediaStreamTrack, track)
  assert.equal(emit.mock.calls[0].arguments[0], RoomEvent.LocalTrackPublished)
  await participant.setMicrophoneEnabled(false)
  assert.equal(participant.isMicrophoneEnabled, false)
  await participant.setMicrophoneEnabled(true)
  assert.equal(participant.isMicrophoneEnabled, true)
  assert.equal(produce.mock.callCount(), 1)
})

test('publication failure releases an SDK-captured microphone', async (t) => {
  const track = makeTrack()
  const previous = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true, value: { getUserMedia: async () => makeStream(track) },
  })
  t.after(() => {
    if (previous) Object.defineProperty(navigator, 'mediaDevices', previous)
    else delete navigator.mediaDevices
  })
  const participant = new LocalParticipant('peer', 'identity', 'name', '', {})
  participant._init(async () => {}, { produce: async () => { throw new Error('produce failed') } })
  await assert.rejects(participant.setMicrophoneEnabled(true), /produce failed/)
  assert.equal(track.readyState, 'ended')
})

const prepareRoom = () => {
  const room = new Room()
  const send = deferred(), recv = deferred()
  const requested = []
  room._signal = {
    connect: async () => ({ self: { id: 'peer', identity: 'identity', grant: { canPublishData: false } }, iceServers: [], rtpCapabilities: {}, peers: [] }),
    request: async (method, { direction }) => {
      assert.equal(method, 'createTransport')
      requested.push(direction)
      return (direction === 'send' ? send : recv).promise
    },
    setNotifyHandler() {}, setCloseHandler() {}, close() {},
  }
  return { room, send, recv, requested }
}

test('send and receive transport requests overlap', async () => {
  const { room, send, recv, requested } = prepareRoom()
  const connecting = room.connect('wss://example.test', 'test-token')
  await new Promise(setImmediate)
  assert.deepEqual(requested, ['send', 'recv'])
  send.resolve({ id: 'send' })
  recv.resolve({ id: 'recv' })
  await connecting
  assert.equal(room.state, 'connected')
  await room.disconnect()
})

test('failed parallel transport leaves its successful sibling available for cleanup', async () => {
  const { room, send, recv } = prepareRoom()
  const connecting = room.connect('wss://example.test', 'test-token')
  const failed = assert.rejects(connecting, /recv failed/)
  send.resolve({ id: 'send' })
  recv.reject(new Error('recv failed'))
  await failed
  const transport = room._sendTransport
  assert.ok(transport)
  await room.disconnect()
  assert.equal(transport.close.mock.callCount(), 1)
})

test('video publication negotiates demand control with the SFU through the installed SDK', async () => {
  const room = new Room({ dynacast: true })
  const handlers = new Map()
  room._device = { createSendTransport: () => ({ id: 'send', on: (event, handler) => handlers.set(event, handler) }) }
  const request = mock.fn(async (method) => method === 'createTransport' ? { id: 'send' } : { producerId: 'screen' })
  room._signal = { request }
  await room._createTransport('send')
  await new Promise((resolve, reject) => handlers.get('produce')({
    kind: 'video', rtpParameters: {}, appData: { source: Track.Source.ScreenShare, dynacast: true },
  }, resolve, reject))
  assert.equal(request.mock.calls.at(-1).arguments[0], 'produce')
  assert.equal(request.mock.calls.at(-1).arguments[1].appData.dynacast, true)
})


test('switching microphones preserves processing settings before transmitting the new track', async (t) => {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
  const filters = { autoGainControl: false, noiseSuppression: false, echoCancellation: false }
  const oldTrack = { ...makeTrack(), getConstraints: () => ({ ...filters, deviceId: { exact: 'old' } }) }
  const nextTrack = makeTrack()
  let captured
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: {
    getUserMedia: async (constraints) => { captured = constraints; return makeStream(nextTrack) },
  } })
  t.after(() => {
    if (previous) Object.defineProperty(navigator, 'mediaDevices', previous)
    else delete navigator.mediaDevices
  })
  const room = new Room()
  const participant = new LocalParticipant('peer', 'identity', 'name', '', {})
  participant._init(async () => {}, { produce: async () => ({ id: 'mic', replaceTrack: async ({ track }) => {
    assert.equal(track, nextTrack)
    assert.deepEqual(captured.audio, { ...filters, deviceId: { exact: 'new' } })
  } }) })
  const publication = await participant.publishTrack(oldTrack, { source: Track.Source.Microphone })
  room._localParticipant = participant
  await room.switchActiveDevice('audioinput', 'new', true)
  assert.equal(publication.track.mediaStreamTrack, nextTrack)
  assert.equal(oldTrack.readyState, 'ended')
})

const screenTrack = () => ({
  kind: 'video', readyState: 'live', enabled: true,
  stop() { this.readyState = 'ended' },
  getSettings: () => ({ width: 1920, height: 1080 }),
  addEventListener() {},
})
const installDisplayCapture = (t, capture) => {
  const previous = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getDisplayMedia: capture } })
  t.after(() => {
    if (previous) Object.defineProperty(navigator, 'mediaDevices', previous)
    else delete navigator.mediaDevices
  })
}
const displayStream = (video, audio) => ({
  getTracks: () => [video, audio].filter(Boolean),
  getVideoTracks: () => video ? [video] : [],
  getAudioTracks: () => audio ? [audio] : [],
})

test('leaving while the screen picker is open stops late video and audio without publishing', async (t) => {
  const picker = deferred(), video = screenTrack(), audio = makeTrack()
  installDisplayCapture(t, () => picker.promise)
  const participant = new LocalParticipant('peer', 'identity', 'name', '', {})
  const produce = mock.fn()
  participant._init(async () => {}, { produce })
  const starting = participant.setScreenShareEnabled(true)
  const rejected = assert.rejects(starting, /cancelled/)
  participant._dispose(true)
  picker.resolve(displayStream(video, audio))
  await rejected
  assert.equal(video.readyState, 'ended')
  assert.equal(audio.readyState, 'ended')
  assert.equal(produce.mock.callCount(), 0)
})

test('screen audio publication failure rolls back video and releases both capture tracks', async (t) => {
  const video = screenTrack(), audio = makeTrack()
  installDisplayCapture(t, async () => displayStream(video, audio))
  const close = mock.fn()
  const participant = new LocalParticipant('peer', 'identity', 'name', '', {})
  participant._init(async () => {}, { produce: async ({ track }) => {
    if (track.kind === 'audio') throw new Error('audio failed')
    return { id: 'video', close }
  } })
  await assert.rejects(participant.setScreenShareEnabled(true), /audio failed/)
  assert.equal(video.readyState, 'ended')
  assert.equal(audio.readyState, 'ended')
  assert.equal(participant.publications.size, 0)
  assert.equal(close.mock.callCount(), 1)
})

test('duplicate screen starts share one capture and stop invalidates a pending picker', async (t) => {
  const picker = deferred(), video = screenTrack()
  const capture = mock.fn(() => picker.promise)
  installDisplayCapture(t, capture)
  const participant = new LocalParticipant('peer', 'identity', 'name', '', {})
  participant._init(async () => {}, { produce: mock.fn() })
  const first = assert.rejects(participant.setScreenShareEnabled(true), /cancelled/)
  const second = assert.rejects(participant.setScreenShareEnabled(true), /cancelled/)
  await participant.setScreenShareEnabled(false)
  picker.resolve(displayStream(video))
  await Promise.all([first, second])
  assert.equal(capture.mock.callCount(), 1)
  assert.equal(video.readyState, 'ended')
})

test('stopping during video publication rolls back a producer that resolves late', async (t) => {
  const produced = deferred(), video = screenTrack(), close = mock.fn()
  installDisplayCapture(t, async () => displayStream(video))
  const participant = new LocalParticipant('peer', 'identity', 'name', '', {})
  participant._init(async () => {}, { produce: () => produced.promise })
  const starting = assert.rejects(participant.setScreenShareEnabled(true), /cancelled/)
  await new Promise(setImmediate)
  await participant.setScreenShareEnabled(false)
  produced.resolve({ id: 'video', close })
  await starting
  assert.equal(video.readyState, 'ended')
  assert.equal(participant.publications.size, 0)
  assert.equal(close.mock.callCount(), 1)
})
