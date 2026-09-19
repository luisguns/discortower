import { test } from 'node:test'
import assert from 'node:assert/strict'
import { participantIdentity } from '../supabase/functions/_shared/participant-identity.ts'

test('token refresh keeps its authenticated account and attempt, fresh joins remain distinct', () => {
  const account = crypto.randomUUID(), other = crypto.randomUUID(), attempt = crypto.randomUUID()
  const identity = participantIdentity(account, attempt)
  assert.equal(participantIdentity(account, attempt.toUpperCase()), identity)
  assert.notEqual(participantIdentity(other, attempt), identity)
  assert.notEqual(participantIdentity(account, crypto.randomUUID()), identity)
  assert.match(identity, /^usr_[0-9a-f-]{36}_[0-9a-f]{32}$/)
  assert.notEqual(participantIdentity(account, undefined), participantIdentity(account, undefined))
  assert.equal(participantIdentity(account, 'invalid private text').includes('private'), false)
})
