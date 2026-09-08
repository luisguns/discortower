import assert from 'node:assert/strict'
import test from 'node:test'
import {
  presenceRefreshDelay,
  projectedPresenceInvocationsPerHour,
} from '../src/services/presenceTiming.ts'

test('visible presence cadence removes at least 70% of periodic invocations', () => {
  assert.equal(presenceRefreshDelay('visible'), 60_000)
  const candidate = projectedPresenceInvocationsPerHour('visible')
  assert.equal(candidate, 120)
  assert.ok(1 - candidate / 420 >= 0.70)
})

test('hidden presence backs off without overlapping the visible cadence', () => {
  assert.equal(presenceRefreshDelay('hidden'), 300_000)
  assert.equal(projectedPresenceInvocationsPerHour('hidden'), 32)
})
