export const presenceRefreshDelay = (visibility: DocumentVisibilityState) =>
  visibility === 'visible' ? 60_000 : 300_000

export const projectedPresenceInvocationsPerHour = (visibility: DocumentVisibilityState) => {
  const summary = 3_600_000 / presenceRefreshDelay(visibility)
  const heartbeat = 3_600_000 / (visibility === 'visible' ? 60_000 : 180_000)
  return summary + heartbeat
}
