import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { stripTypeScriptTypes } from 'node:module'
import { resolveScreenShareQuality, screenShareExceedsPolicy } from '../supabase/functions/_shared/screen-share-policy.ts'

const settings = { member_screen_share_quality: '720p30', host_screen_share_quality: '1080p30', manager_screen_share_quality: '1080p60' }
test('account overrides and role permissions determine allowed resolution, including portrait capture', () => {
  for (const [role, override, expected] of [
    ['member', null, '720p30'], ['host', null, '1080p30'], ['manager', null, '1080p60'], ['owner', null, '1080p60'],
    ['member', '1080p60', '1080p60'], ['owner', '720p30', '720p30'], ['member', 'invalid', '720p30'],
  ]) {
    const quality = resolveScreenShareQuality(role, override, settings)
    assert.equal(quality, expected)
    assert.equal(screenShareExceedsPolicy(quality, 1920, 1080).exceeded, expected === '720p30')
    assert.equal(screenShareExceedsPolicy(quality, 1080, 1920).exceeded, expected === '720p30')
    assert.equal(screenShareExceedsPolicy(quality, 1280, 720).exceeded, false)
    assert.equal(screenShareExceedsPolicy(quality, 3840, 2160).exceeded, true)
  }
})

test('actual webhook accepts authorized 1080p and revokes unauthorized 1080p using trusted account context', async t => {
  const source = stripTypeScriptTypes(await readFile(new URL('../supabase/functions/livekit-webhook/index.ts', import.meta.url), 'utf8'))
  let handle, context, rpcError = null
  const updates = [], audits = []
  const room = { id: 'room-id', room_name: 'test-room', channel_id: null }
  const client = {
    rpc: async (name, args) => {
      assert.equal(name, 'get_token_issue_context')
      assert.equal(args.p_user_id, '11111111-1111-1111-1111-111111111111')
      return { data: context, error: rpcError }
    },
    from: table => {
      const chain = {
        select() { return chain }, eq() { return chain }, is() { return chain }, update() { return chain },
        insert: async () => ({ error: null }), upsert: async () => ({ error: null }),
        maybeSingle: async () => ({ data: table === 'room_sessions' ? room : null, error: null }),
      }
      return chain
    },
  }
  const deps = {
    resolveScreenShareQuality, screenShareExceedsPolicy,
    WebhookReceiver: class { async receive(body) { return JSON.parse(body) } },
    writeAudit: async (_, record) => audits.push(record), adminClient: () => client,
    handleFunctionError: () => new Response('failed', { status: 500 }), HttpError: Error,
    jsonResponse: (_, body) => Response.json(body), optionsResponse: () => new Response(),
    livekitConfig: () => ({}), roomService: () => ({ updateParticipant: async (...args) => updates.push(args) }),
    TrackSource: { MICROPHONE: 'microphone', CAMERA: 'camera' },
    Deno: { serve: callback => { handle = callback } },
  }
  globalThis.__screenPolicyFixture = deps
  t.after(() => delete globalThis.__screenPolicyFixture)
  const transformed = source.replace(/import\s+\{([^}]+)\}\s+from\s+['"][^'"]+['"]/g, (_, names) => `const { ${names} } = globalThis.__screenPolicyFixture`)
  await import(`data:text/javascript;base64,${Buffer.from('const { Deno } = globalThis.__screenPolicyFixture;\n' + transformed).toString('base64')}`)
  const publish = () => handle(new Request('https://test.invalid', { method: 'POST', body: JSON.stringify({ id: crypto.randomUUID(), event: 'track_published', room: { sid: 'sid' }, participant: { identity: 'usr_11111111-1111-1111-1111-111111111111_session' }, track: { source: 'screen_share', width: 1920, height: 1080 } }) }))
  for (const role of ['host', 'owner']) {
    context = { role, profile: {}, mediaSettings: settings }
    assert.equal((await publish()).status, 200)
    assert.equal(updates.length, 0)
    assert.equal(audits.length, 0)
  }
  context = { role: 'member', profile: {}, mediaSettings: settings }
  assert.equal((await publish()).status, 200)
  assert.equal(updates.length, 1)
  assert.equal(audits[0].metadata.authorizedQuality, '720p30')
  rpcError = new Error('database unavailable')
  assert.equal((await publish()).status, 500)
  assert.equal(updates.length, 1, 'lookup failure must not silently downgrade an authorized user')
})
