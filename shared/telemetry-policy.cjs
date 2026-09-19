// Shared by browser and Electron. No user content, credentials or media payloads.
const privateKey = /authorization|cookie|password|secret|token|email|username|displayname|metadata|sdp|candidate|deviceid|groupid|label|body|payload|headers|arguments|vars|pre_context|post_context|context_line/i
function cleanText(value) {
  return value
    .replace(/(?:https?|wss?|splotys-app):\/\/[^\s"'<>]+/gi, (url) => url.split(/[?#]/)[0])
    .replace(/(?:Bearer\s+)?eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[redacted]')
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
    .replace(/(?:[A-Z]:\\Users\\|\/Users\/|\/home\/)[^\\/\s]+/gi, '[home]')
    .slice(0, 2000)
}
function scrub(value, depth = 0) {
  if (depth > 12) return '[depth]'
  if (typeof value === 'string') return cleanText(value)
  if (Array.isArray(value)) return value.slice(0, 100).map(v => scrub(v, depth + 1))
  if (!value || typeof value !== 'object') return value
  const result = {}
  for (const [key, item] of Object.entries(value)) {
    if (!privateKey.test(key)) result[key] = scrub(item, depth + 1)
  }
  return result
}
function prepareEvent(event, origin, processName, sessionId) {
  const safe = scrub(event)
  // Prevent ingest from deriving a user location from the transport IP.
  safe.user = { ip_address: '0.0.0.0' }
  delete safe.request
  delete safe.server_name
  delete safe.extra
  safe.tags = { ...safe.tags, origin, process: safe.tags?.process || processName, session_id: safe.tags?.session_id || sessionId }
  return safe
}
// A bad loop must not exhaust the free plan. Fixed-size, fixed-window budgets.
function createBudget(limit, windowMs, now = Date.now) {
  let start = now(), used = 0
  return () => {
    if (now() - start >= windowMs) { start = now(); used = 0 }
    return ++used <= limit
  }
}
module.exports = { scrub, cleanText, prepareEvent, createBudget }
