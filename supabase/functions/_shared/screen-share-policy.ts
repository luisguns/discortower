export type ScreenShareQuality = '720p30' | '1080p30' | '1080p60'
export type MediaSettings = {
  member_screen_share_quality?: string
  host_screen_share_quality?: string
  manager_screen_share_quality?: string
}

export function resolveScreenShareQuality(role: string, override: unknown, settings: MediaSettings): ScreenShareQuality {
  const configured = override ?? (role === 'owner' ? '1080p60'
    : role === 'manager' ? settings.manager_screen_share_quality
      : role === 'host' ? settings.host_screen_share_quality : settings.member_screen_share_quality)
  return configured === '1080p30' || configured === '1080p60' ? configured : '720p30'
}

export function screenShareExceedsPolicy(quality: ScreenShareQuality, width: number, height: number) {
  // Match the account quality, including portrait screens. The legacy global
  // 1280 setting predates per-role/account permissions and must not override them.
  const maxDimension = quality === '720p30' ? 1280 : 1920
  return { maxDimension, exceeded: Math.max(width, height) > maxDimension }
}
