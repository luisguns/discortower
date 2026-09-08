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

test('pre-captured audio publishes without opening a second microphone', async () => {
  const participant = new LocalParticipant('peer', 'identity', 'name', '', {})
  const track = makeTrack()
  const produce = mock.fn(async () => ({ id: 'producer' }))
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
