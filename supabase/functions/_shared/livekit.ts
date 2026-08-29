import { AccessToken, RoomServiceClient } from 'npm:livekit-server-sdk@2.15.0'

const required = (name: string) => {
  const value = Deno.env.get(name)?.trim()
  if (!value) throw new Error(`LIVEKIT_${name}_NOT_CONFIGURED`)
  return value
}

const httpUrl = (value: string) => value.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:')

export const livekitConfig = () => ({
  apiKey: required('LIVEKIT_API_KEY'),
  apiSecret: required('LIVEKIT_API_SECRET'),
  url: required('LIVEKIT_URL'),
})

export const roomService = () => {
  const config = livekitConfig()
  return new RoomServiceClient(httpUrl(config.url), config.apiKey, config.apiSecret)
}

export const issueParticipantToken = async (roomName: string, identity: string, name: string, metadata: string) => {
  const config = livekitConfig()
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    name,
    metadata,
    ttl: '5m',
  })
  token.addGrant({
    canPublish: true,
    canPublishData: true,
    canSubscribe: true,
    room: roomName,
    roomJoin: true,
  })
  return { participantToken: await token.toJwt(), serverUrl: config.url }
}
