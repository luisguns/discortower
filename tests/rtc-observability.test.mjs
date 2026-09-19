import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { RoomEvent, Track } from '@gunns-dev/control-tower-client'

test('RTC observers are idempotent and release their timer and listeners', async t => {
  const events = [], timers = new Set()
  const conditionSource = stripTypeScriptTypes(await readFile(new URL('../src/services/diagnosticState.ts', import.meta.url), 'utf8'))
  const { createConditionMonitor } = await import(`data:text/javascript;base64,${Buffer.from(conditionSource).toString('base64')}`)
  const deps = { RoomEvent, Track, createConditionMonitor, getCallContext: () => ({ call_id: 'call-a' }), observe: (...args) => events.push(args), reportFailure: (...args) => events.push(args) }
  globalThis.__rtcObservabilityFixture = deps
  t.after(() => delete globalThis.__rtcObservabilityFixture)
  const source = stripTypeScriptTypes(await readFile(new URL('../src/services/rtcObservability.ts', import.meta.url), 'utf8'))
    .replace(/import\s+\{[^}]*\}\s+from\s+['"][^'"]+['"]/g, match => match.includes('control-tower')
      ? 'const { RoomEvent, Track } = globalThis.__rtcObservabilityFixture'
      : match.includes('diagnosticState') ? 'const { createConditionMonitor } = globalThis.__rtcObservabilityFixture'
      : 'const { observe, reportFailure, getCallContext } = globalThis.__rtcObservabilityFixture')
  const module = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
  const oldWindow = globalThis.window, oldDocument = globalThis.document
  globalThis.window = { setInterval: cb => { timers.add(cb); return cb } }
  globalThis.document = { hidden: false, visibilityState: 'visible' }
  t.mock.method(globalThis, 'clearInterval', cb => timers.delete(cb))
  t.after(() => { globalThis.window = oldWindow; globalThis.document = oldDocument })
  const listeners = new Map()
  let now = 0
  t.mock.method(performance, 'now', () => now)
  const local = { identity: 'usr_11111111-1111-1111-1111-111111111111_local', isScreenShareEnabled: true, getTrackPublication: () => undefined }
  const remotePublication = { trackSid: 'producer-2', isDesired: true, isMuted: false }
  const remote = { identity: 'usr_11111111-1111-1111-1111-111111111111_remote', getTrackPublication: source => source === Track.Source.ScreenShare ? remotePublication : undefined }
  const room = { state: 'connected', localParticipant: local, remoteParticipants: new Map([['peer', remote]]), on: (event, cb) => listeners.set(event, cb), off: event => listeners.delete(event) }
  module.observeRoom(room); module.observeRoom(room)
  assert.equal(timers.size, 1)
  listeners.get(RoomEvent.TrackUnsubscribed)({ trackSid: 'producer-1', source: 'screen_share' })
  assert.equal(events.at(-1)[0], 'rtc.trackUnsubscribed')
  assert.equal(events.at(-1)[1].publication_id, 'producer-1')
  for (const tick of timers) tick()
  now = 5000
  for (const tick of timers) tick()
  assert.equal(events.filter(event => event[0] === 'screen.capture_mismatch').length, 1)
  assert.equal(events.filter(event => event[0] === 'rtc.duplicate_account_candidate').length, 1)
  now = 15000
  for (const tick of timers) tick()
  assert.equal(events.filter(event => event[0] === 'rtc.subscription_no_media').length, 1)
  local.isScreenShareEnabled = false
  remotePublication.track = { mediaStreamTrack: { readyState: 'live' } }
  now = 20000
  for (const tick of timers) tick()
  assert.equal(events.filter(event => event[0] === 'rtc.subscription_no_media.recovered').length, 1)
  assert.equal(events.filter(event => event[0] === 'screen.capture_mismatch.recovered').length, 1)
  assert.equal(JSON.stringify(events).includes(local.identity), false)
  module.stopObservingRoom(room)
  assert.equal(timers.size, 0); assert.equal(listeners.size, 0)

  now = 0
  let frame
  const element = Object.assign(new EventTarget(), { paused: false, readyState: 4, videoWidth: 640, videoHeight: 360,
    requestVideoFrameCallback: cb => { frame = cb; return 1 }, cancelVideoFrameCallback: () => { frame = null } })
  const track = Object.assign(new EventTarget(), { readyState: 'live', muted: false, enabled: true })
  const cleanup = module.observeVideo(element, track, 'screen_share')
  frame()
  assert.equal(events.at(-1)[0], 'video.first_frame')
  now = 16000
  for (const tick of timers) tick()
  assert.equal(events.at(-1)[0], 'video.no_frames')
  frame()
  assert.equal(events.at(-1)[0], 'video.recovered')
  cleanup()
  assert.equal(timers.size, 0); assert.equal(frame, null)
  element.paused = true
  const cleanupPaused = module.observeVideo(element, track, 'screen_share')
  now += 16000
  for (const tick of timers) tick()
  assert.equal(events.at(-1)[0], 'video.no_first_frame')
  cleanupPaused()
  assert.equal(timers.size, 0)
})
