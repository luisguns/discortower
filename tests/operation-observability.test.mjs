import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'

const load = async (name, transform = source => source) => {
  const source = transform(stripTypeScriptTypes(await readFile(new URL(`../src/services/${name}.ts`, import.meta.url), 'utf8')))
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('conditions tolerate transitions, deduplicate incidents, and distinguish removed tracks from recovery', async () => {
  const { createConditionMonitor } = await load('diagnosticState')
  let now = 0
  const events = [], monitor = createConditionMonitor((...args) => events.push(args), () => now)
  monitor.check('track', 'no_media', true)
  now = 5000; monitor.check('track', 'no_media', false)
  assert.equal(events.length, 0)
  monitor.check('track', 'no_media', true)
  now = 20000; monitor.check('track', 'no_media', true)
  now = 25000; monitor.check('track', 'no_media', true)
  assert.equal(events.length, 1)
  monitor.retain(new Set())
  assert.equal(events.at(-1)[0], 'no_media.ended')
  monitor.check('track', 'no_media', true, {}, 0)
  monitor.check('track', 'no_media', false)
  assert.equal(events.at(-1)[0], 'no_media.recovered')
  monitor.clear(); monitor.retain(new Set())
  assert.equal(events.length, 4)
})

test('operation watchdog preserves results/errors and original call context, and clears timers', async t => {
  const events = [], timers = new Map()
  let now = 0, call = 'call-a', nextTimer = 0
  const oldWindow = globalThis.window
  globalThis.window = { setTimeout: cb => { timers.set(++nextTimer, cb); return nextTimer }, clearTimeout: id => timers.delete(id) }
  globalThis.__operationFixture = { observe: (...args) => events.push(args), reportFailure: (...args) => events.push(args), measure: () => {}, getCallContext: () => ({ call_id: call }) }
  t.after(() => { globalThis.window = oldWindow; delete globalThis.__operationFixture })
  t.mock.method(performance, 'now', () => now)
  const { observeOperation, observeRealtime } = await load('operationObservability', source => source.replace(/import[^\n]+from[^\n]+/, 'const { observe, reportFailure, measure, getCallContext } = globalThis.__operationFixture'))
  let resolve
  const work = observeOperation('test.action', () => new Promise(done => { resolve = done }))
  call = 'call-b'; now = 15000
  for (const tick of timers.values()) tick()
  assert.equal(events.at(-1)[0], 'test.action.slow')
  assert.equal(events.at(-1)[1].call_id, 'call-a')
  const value = {}; resolve(value)
  assert.equal(await work, value)
  assert.equal(timers.size, 0)
  const original = new Error('private response content')
  await assert.rejects(observeOperation('test.failure', async () => { throw original }), error => error === original)
  const failure = events.find(event => event[0] === 'test.failure')
  assert.equal(failure[1].message.includes('private'), false)
  assert.equal(timers.size, 0)

  const realtime = observeRealtime('friends')
  realtime.status('CHANNEL_ERROR'); now += 5000; realtime.status('SUBSCRIBED')
  assert.equal(events.at(-1)[0], 'realtime.recovered')
  realtime.stop(); const length = events.length
  realtime.status('CLOSED')
  assert.equal(events.length, length)
  assert.equal(timers.size, 0)
})
