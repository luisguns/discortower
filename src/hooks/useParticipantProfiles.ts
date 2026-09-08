import { useCallback, useEffect, useRef, useState } from 'react'
import { RoomEvent, type Room } from '@gunns-dev/control-tower-client'
import {
  PROFILE_AVATAR_TOPIC,
  parseAvatarBroadcast,
  serializeAvatarBroadcast,
} from '../services/profile'

// Avatars are exchanged peer-to-peer over the RTC data channel instead of being
// embedded in the participant token: a data-URL avatar can be hundreds of KB,
// and putting it in the token pushes the signaling WebSocket URL
// (`?access_token=…`) past the browser/proxy request-line limit, which silently
// drops the upgrade and breaks the call. This hook broadcasts the local avatar
// and collects remote ones, keyed by participant identity.
export const useParticipantProfiles = (room: Room, localAvatarDataUrl?: string) => {
  const [avatars, setAvatars] = useState<Map<string, string>>(new Map())
  const localAvatarRef = useRef(localAvatarDataUrl)
  localAvatarRef.current = localAvatarDataUrl

  const broadcast = useCallback(() => {
    const avatar = localAvatarRef.current
    if (!avatar) return
    void room.localParticipant
      .sendText(serializeAvatarBroadcast(avatar), { topic: PROFILE_AVATAR_TOPIC })
      .catch(() => {
        // A dropped avatar packet only means peers keep showing initials; the
        // next ParticipantConnected re-broadcast will heal it.
      })
  }, [room])

  useEffect(() => {
    const receive = (
      reader: Parameters<Parameters<Room['registerTextStreamHandler']>[1]>[0],
      participantInfo: { identity: string },
    ) => {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 20_000)
      void reader
        .readAll({ signal: controller.signal })
        .then((text) => {
          const avatarDataUrl = parseAvatarBroadcast(text)
          setAvatars((current) => {
            if (current.get(participantInfo.identity) === avatarDataUrl) return current
            const next = new Map(current)
            if (avatarDataUrl) next.set(participantInfo.identity, avatarDataUrl)
            else next.delete(participantInfo.identity)
            return next
          })
        })
        .catch(() => undefined)
        .finally(() => window.clearTimeout(timeoutId))
    }

    room.registerTextStreamHandler(PROFILE_AVATAR_TOPIC, receive)

    // Re-announce whenever someone new arrives so late joiners get our avatar,
    // and drop avatars of people who leave.
    const onConnected = () => broadcast()
    const onDisconnected = (participant: { identity: string }) => {
      setAvatars((current) => {
        if (!current.has(participant.identity)) return current
        const next = new Map(current)
        next.delete(participant.identity)
        return next
      })
    }
    room.on(RoomEvent.ParticipantConnected, onConnected)
    room.on(RoomEvent.ParticipantDisconnected, onDisconnected as never)

    // Announce once for participants already in the room at join time.
    broadcast()

    return () => {
      room.unregisterTextStreamHandler(PROFILE_AVATAR_TOPIC)
      room.off(RoomEvent.ParticipantConnected, onConnected)
      room.off(RoomEvent.ParticipantDisconnected, onDisconnected as never)
    }
  }, [broadcast, room])

  // If the local avatar changes while connected, let peers know.
  useEffect(() => {
    broadcast()
  }, [broadcast, localAvatarDataUrl])

  return avatars
}
