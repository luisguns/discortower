const { test } = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { installWindowLifecycle } = require('../electron/window-lifecycle.cjs')

const setup = () => {
  const window = new EventEmitter()
  const contents = window.webContents = new EventEmitter()
  const state = { reloads: 0, resets: 0, paints: 0, quitting: false, logs: [] }
  contents.reload = () => state.reloads++
  contents.invalidate = () => state.paints++
  installWindowLifecycle(window, {
    diagnostic: (...args) => state.logs.push(args),
    resetCall: () => state.resets++,
    isQuitting: () => state.quitting,
  })
  return { window, contents, state }
}

test('F5 reloads once and top-level reload resets call state', () => {
  const { contents, state } = setup()
  let prevented = 0
  const event = { preventDefault: () => prevented++ }
  contents.emit('before-input-event', event, { key: 'F5', type: 'keyDown' })
  contents.emit('before-input-event', event, { key: 'F5', type: 'keyDown', isAutoRepeat: true })
  contents.emit('before-input-event', event, { key: 'F5', type: 'keyUp' })
  assert.equal(state.reloads, 1)
  assert.equal(prevented, 1)
  contents.emit('did-start-navigation', {}, '', true, true)
  contents.emit('did-start-navigation', {}, '', false, false)
  assert.equal(state.resets, 0)
  contents.emit('did-start-navigation', {}, '', false, true)
  assert.equal(state.resets, 1)
})

test('renderer crash resets call and recovers once without a reload loop', () => {
  const { contents, state } = setup()
  for (let i = 0; i < 3; i++) contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
  assert.equal(state.reloads, 1)
  assert.equal(state.resets, 3)
  const quitting = setup()
  quitting.state.quitting = true
  quitting.contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 })
  assert.equal(quitting.state.reloads, 0)
})

test('restore repaints without reloading or interrupting an active call', () => {
  const { window, state } = setup()
  window.emit('minimize')
  window.emit('restore')
  assert.equal(state.paints, 1)
  assert.equal(state.resets, 0)
  assert.equal(state.reloads, 0)
})

test('diagnostics keep event codes without arbitrary console content', () => {
  const { contents, state } = setup()
  contents.emit('console-message', {}, { message: 'RTC_JOIN_FAILED message=private-token' })
  contents.emit('console-message', {}, { message: 'private chat text' })
  assert.deepEqual(state.logs, [['RTC_JOIN_FAILED']])
})
