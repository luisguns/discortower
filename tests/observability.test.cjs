const { test } = require('node:test')
const assert = require('node:assert/strict')
const { prepareEvent, scrub, createBudget } = require('../shared/telemetry-policy.cjs')

test('WEB and DESKTOP events retain technical context but strip sensitive data recursively', () => {
  for (const origin of ['WEB', 'DESKTOP']) {
    const result = prepareEvent({
      user: { id: 'user-secret', email: 'private@example.com' },
      request: { url: 'https://app.test/?access_token=secret', headers: { authorization: 'secret' } },
      extra: { session: 'secret' },
      contexts: { media: { state: 'connected', token: 'secret', metadata: 'private', sdp: 'private', nested: { password: 'private' } } },
      exception: { values: [{ type: 'Error', value: 'Failed https://app.test/rtc?token=secret#invite at private@example.com', stacktrace: { frames: [{ filename: 'https://app.test/main.js', lineno: 7, vars: { secret: 'private' } }] } }] },
    }, origin, 'renderer', 'session')
    const encoded = JSON.stringify(result)
    for (const secret of ['user-secret', 'private', 'token=secret', 'authorization']) assert.ok(!encoded.includes(secret), secret)
    assert.equal(result.tags.origin, origin)
    assert.equal(result.contexts.media.state, 'connected')
    assert.equal(result.exception.values[0].stacktrace.frames[0].lineno, 7)
  }
})
test('redaction is bounded and handles cycles without throwing', () => {
  const value = { status: 500 }; value.self = value
  assert.doesNotThrow(() => scrub(value))
})
test('budget limits an event storm and resets after its window', () => {
  let time = 0
  const allow = createBudget(2, 1000, () => time)
  assert.equal(allow(), true); assert.equal(allow(), true); assert.equal(allow(), false)
  time = 1000
  assert.equal(allow(), true)
})
