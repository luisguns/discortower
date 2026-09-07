import { AccessToken, RoomServiceClient, TrackSource } from 'npm:@gunns-dev/control-tower-server-sdk@0.1.0'

export { TrackSource }

const required = (name: string) => {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`${name}_NOT_CONFIGURED`)
  return value
}

const httpUrl = (value: string) => value.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')

export const rtcProvider = () => (Deno.env.get('RTC_PROVIDER')?.trim() === 'torre' ? 'torre' : 'livekit') as 'livekit' | 'torre'

export const livekitConfig = () => {
  const provider = rtcProvider()
  if (provider === 'torre') {
    return {
      apiKey: Deno.env.get('RTC_API_KEY')?.trim() || required('LIVEKIT_API_KEY'),
      apiSecret: Deno.env.get('RTC_API_SECRET')?.trim() || required('LIVEKIT_API_SECRET'),
      url: Deno.env.get('RTC_URL')?.trim() || required('LIVEKIT_URL'),
    }
  }
  return {
    apiKey: required('LIVEKIT_API_KEY'),
    apiSecret: required('LIVEKIT_API_SECRET'),
    url: required('LIVEKIT_URL'),
  }
}

export const roomService = () => {
  const config = livekitConfig()
  return new RoomServiceClient(httpUrl(config.url), config.apiKey, config.apiSecret)
}

export const issueParticipantToken = async (roomName: string, identity: string, name: string, metadata: string, options: { canHighQualityScreenShare?: boolean; canScreenShare?: boolean } = {}) => {
  const config = livekitConfig()
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name,
    metadata,
    ttl: '5m',
  })
  const canScreenShare = options.canScreenShare !== false
  token.addGrant({
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    canPublishSources: canScreenShare
      ? [TrackSource.MICROPHONE, TrackSource.CAMERA, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
      : [TrackSource.MICROPHONE, TrackSource.CAMERA],
    room: roomName,
    roomJoin: true,
  })
  const provider = rtcProvider()
  return { participantToken: await token.toJwt(), serverUrl: config.url, provider }
}
