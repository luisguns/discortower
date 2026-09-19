import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

// Execute the actual hook's async lifecycle with deterministic React scheduling.
// The SDK and permission prompt are boundaries; no network or device is opened.
const source = stripTypeScriptTypes(await readFile(new URL('../src/hooks/useLiveKitRoom.ts', import.meta.url), 'utf8'))
const deferred = () => {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const fakeRoom = () => ({
  localParticipant: { getTrackPublication: () => undefined },
  on() {}, removeAllListeners() {},
  connects: 0, disconnects: 0,
  async connect() { this.connects++ },
  async disconnect() { this.disconnects++ },
})
let fixtureId = 0
const setup = async (createRoom) => {
  const states = [], cleanup = []
  const dependencies = {
    observe() {}, reportFailure() {}, measure() {}, setCallContext() {}, observeRoom() {}, stopObservingRoom() {}, rtcConnectionUrl: value => value,
    useCallback: (fn) => fn,
    useEffect: (fn) => cleanup.push(fn()),
    useRef: (value) => ({ current: value }),
    useState: (value) => {
      const index = states.push(value) - 1
      return [value, (next) => { states[index] = next }]
    },
    ConnectionState: {}, RoomEvent: {}, Track: { Source: {} }, createRoom,
    fetchConnectionDetails: async () => ({ serverUrl: 'wss://example.test', participantToken: 'test', provider: 'torre' }),
    friendlyConnectionError: () => 'failed', friendlyMicrophoneError: () => 'failed',
    getMicrophoneMuted: () => false, saveLocalProfile() {}, microphoneCaptureOptions: () => ({}),
    startMicrophoneCapture: () => ({ result: new Promise(() => {}), cancel() {} }),
  }
  const key = `__callHookFixture${++fixtureId}`
  globalThis[key] = dependencies
  const transformed = source.replace(/import\s+\{([\s\S]*?)\}\s+from\s+['"][^'"]+['"];?/g,
    (_, names) => `const {${names}} = globalThis.${key};`)
  const { useLiveKitRoom } = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`)
  const hook = useLiveKitRoom()
  delete globalThis[key]
  return { hook, states, cleanup: () => cleanup.forEach(fn => fn?.()) }
}

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
  assert.equal(states[1], 'disconnected')
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
