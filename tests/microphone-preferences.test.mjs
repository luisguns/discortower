import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getMicrophoneProcessingOptions, getMicrophoneProcessingEnabled, saveMicrophoneProcessingEnabled,
  getAutoGainControl, saveAutoGainControl,
  getEchoCancellation, saveEchoCancellation,
  getNoiseSuppression, saveNoiseSuppression,
} from '../src/storage/preferences.ts'

test('natural voice defaults and saved independent filter choices survive reload', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window')
  const values = new Map()
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  } } })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'window', previous)
    else delete globalThis.window
  })
  assert.equal(getAutoGainControl(), false)
  assert.equal(getNoiseSuppression(), false)
  assert.equal(getEchoCancellation(), true)
  saveAutoGainControl(true)
  saveNoiseSuppression(true)
  saveEchoCancellation(false)
  assert.equal(getAutoGainControl(), true)
  assert.equal(getNoiseSuppression(), true)
  assert.equal(getEchoCancellation(), false)
  saveAutoGainControl(false)
  assert.equal(getNoiseSuppression(), true)
  assert.equal(getEchoCancellation(), false)
  assert.equal(getAutoGainControl(), false)
  saveAutoGainControl(true)
  saveEchoCancellation(true)
  assert.deepEqual(getMicrophoneProcessingOptions(), { autoGainControl: true, echoCancellation: true, noiseSuppression: true })
  saveMicrophoneProcessingEnabled(false)
  assert.equal(getMicrophoneProcessingEnabled(), false)
  assert.deepEqual(getMicrophoneProcessingOptions(), { autoGainControl: false, echoCancellation: false, noiseSuppression: false })
  // Even existing saved filters cannot override the master bypass on the next capture.
  saveNoiseSuppression(true)
  assert.equal(getMicrophoneProcessingOptions().noiseSuppression, false)
  saveMicrophoneProcessingEnabled(true)
  assert.deepEqual(getMicrophoneProcessingOptions(), { autoGainControl: true, echoCancellation: true, noiseSuppression: true })
  // Existing explicit noise reduction choices retain their original key.
  assert.equal(values.get('ford-kall:noise-suppression'), 'true')
})
