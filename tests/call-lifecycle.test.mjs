import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

// Execute the actual hook's async lifecycle with deterministic React scheduling.
// The SDK and permission prompt are boundaries; no network or device is opened.
const source = stripTypeScriptTypes(await readFile(new URL('../src/hooks/useLiveKitRoom.ts', import.meta.url), 'utf8'))
globalThis.window = { setTimeout: () => 1, clearTimeout() {} }
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const fakeRoom = () => ({
  listeners: new Map(),
  localParticipant: { getTrackPublication: () => undefined },
  on(event, fn) { this.listeners.set(event, fn) }, removeAllListeners() { this.listeners.clear() },
  connects: 0, disconnects: 0,
  async connect() { this.connects++ },
  async disconnect() { this.disconnects++ },
})
let fixtureId = 0
const setup = async (createRoom, overrides = {}) => {
  const states = [], cleanup = [], events = []
  const dependencies = {
    observe: (...args) => events.push(args), reportFailure: (...args) => events.push(args), measure() {}, setCallContext() {}, observeRoom() {}, stopObservingRoom() {}, rtcConnectionUrl: value => value,
    useCallback: (fn) => fn,
    useEffect: (fn) => cleanup.push(fn()),
    useRef: (value) => ({ current: value }),
    useState: (value) => {
      const index = states.push(value) - 1
      return [value, (next) => { states[index] = next }]
    },
    ConnectionState: {}, RoomEvent: { Disconnected: 'disconnected', ConnectionStateChanged: 'connectionStateChanged' }, Track: { Source: {} }, createRoom,
    fetchConnectionDetails: async () => ({ serverUrl: 'wss://example.test', participantToken: 'test', provider: 'torre' }),
    friendlyConnectionError: () => 'failed', friendlyMicrophoneError: () => 'failed',
    getMicrophoneMuted: () => false, saveLocalProfile() {}, microphoneCaptureOptions: () => ({}),
    startMicrophoneCapture: () => ({ result: new Promise(() => {}), cancel() {} }),
    ...overrides,
  }
  const key = `__callHookFixture${++fixtureId}`
  globalThis[key] = dependencies
  const transformed = source.replace(/import\s+\{([\s\S]*?)\}\s+from\s+['"][^'"]+['"];?/g,
    (_, names) => `const {${names}} = globalThis.${key};`)
  const { useLiveKitRoom } = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`)
  const hook = useLiveKitRoom()
  delete globalThis[key]
  return { hook, states, events, cleanup: () => cleanup.forEach(fn => fn?.()) }
}

test('token refresh reuses the attempt identity, unexpected disconnect cleans up before re-entry', async () => {
  const requests = [], room = fakeRoom(), disconnecting = deferred()
  let refresh, created = 0
  const fixture = await setup(async (_, provider) => { refresh = provider; created++; return room }, {
    fetchConnectionDetails: async (...args) => { requests.push(args); return { serverUrl: 'wss://example.test', participantToken: 'test', provider: 'torre' } },
  })
  assert.equal(await fixture.hook.join('call', {}), true)
  await refresh()
  assert.deepEqual(requests[0], requests[1])
  assert.match(requests[0][1], /^[a-f0-9-]{36}$/)
  room.disconnect = () => disconnecting.promise
  room.listeners.get('disconnected')(4001)
  assert.equal(fixture.states[0], null)
  assert.equal(fixture.events.some(event => event[0] === 'rtc.disconnected_unexpectedly'), true)
  const next = fixture.hook.join('call', {})
  await new Promise(setImmediate)
  assert.equal(created, 1)
  await fixture.hook.leave()
  disconnecting.resolve()
  assert.equal(await next, false)
  fixture.cleanup()
})

test('authorization failure records its call, attempt and stage', async () => {
  const fixture = await setup(async () => fakeRoom(), { fetchConnectionDetails: async () => { throw new Error('CALL_BLOCKED') } })
  assert.equal(await fixture.hook.join('blocked-call', {}), false)
  const failure = fixture.events.find(event => event[0] === 'rtc.join')
  assert.equal(failure[2].call_id, 'blocked-call')
  assert.equal(failure[2].stage, 'authorization')
  assert.ok(failure[2].attempt_id)
  assert.equal(fixture.states[2], 'error')
  fixture.cleanup()
})

test('leave during room creation cannot connect or replace a newer attempt', async () => {
  const oldFactory = deferred(), newFactory = deferred()
  let calls = 0
  const { hook, cleanup } = await setup(() => ++calls === 1 ? oldFactory.promise : newFactory.promise)
  const oldJoin = hook.join('old', {})
  await new Promise(setImmediate)
  await hook.leave()
  const newJoin = hook.join('new', {})
  await new Promise(setImmediate)
  const oldRoom = fakeRoom()
  oldFactory.resolve(oldRoom)
  assert.equal(await oldJoin, false)
  assert.equal(oldRoom.connects, 0)
  assert.equal(oldRoom.disconnects, 1)
  await hook.leave()
  const newRoom = fakeRoom()
  newFactory.resolve(newRoom)
  assert.equal(await newJoin, false)
  assert.equal(newRoom.connects, 0)
  cleanup()
})

test('leave clears UI and stops devices without waiting for SDK disconnect', async () => {
  const connecting = deferred(), disconnecting = deferred(), room = fakeRoom()
  let stopped = 0
  room.localParticipant.getTrackPublication = () => ({ track: { mediaStreamTrack: { stop: () => stopped++ } } })
  room.connect = () => connecting.promise
  room.disconnect = () => disconnecting.promise
  const { hook, states, cleanup } = await setup(async () => room)
  const join = hook.join('call', {})
  await new Promise(setImmediate)
  await hook.leave()
  assert.equal(states[0], null)
  assert.equal(states[1], '720p30')
  assert.equal(states[2], 'disconnected')
  assert.equal(stopped, 4)
  disconnecting.resolve()
  connecting.resolve()
  assert.equal(await join, false)
  cleanup()
})

test('rapid re-entry waits for the previous SDK disconnect before creating another room', async () => {
  const connecting = deferred(), disconnecting = deferred(), room = fakeRoom()
  room.connect = () => connecting.promise
  room.disconnect = () => disconnecting.promise
  let created = 0
  const { hook, cleanup } = await setup(async () => { created++; return room })
  const first = hook.join('first', {})
  await new Promise(setImmediate)
  await hook.leave()
  const second = hook.join('second', {})
  await new Promise(setImmediate)
  assert.equal(created, 1)
  await hook.leave()
  disconnecting.resolve()
  connecting.resolve()
  assert.equal(await first, false)
  assert.equal(await second, false)
  assert.equal(created, 1)
  cleanup()
})
