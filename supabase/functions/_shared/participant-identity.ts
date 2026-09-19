// userId must come from requireUser, never from the request body. The attempt
// distinguishes fresh joins while keeping token refresh/reconnect on one peer.
export function participantIdentity(userId: string, requestedAttempt: unknown): string {
  const attempt = typeof requestedAttempt === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedAttempt)
    ? requestedAttempt : crypto.randomUUID()
  return `usr_${userId}_${attempt.replaceAll('-', '').toLowerCase()}`
}
