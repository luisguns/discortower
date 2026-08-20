import { useEffect } from 'react'
import {
  RemoteTrackPublication,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type Room,
} from 'livekit-client'

const publicationKey = (participant: RemoteParticipant, publication: RemoteTrackPublication) =>
  `${participant.identity}:${publication.trackSid}`

export const useDesktopPerformanceMode = (room: Room) => {
  useEffect(() => {
    if (!window.fordKallDesktop) return

    const suspendedPublications = new Set<string>()

    const suspendPublication = (
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (publication.kind !== Track.Kind.Video || !publication.isDesired) return
      suspendedPublications.add(publicationKey(participant, publication))
      publication.setSubscribed(false)
    }

    const suspendVideo = () => {
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.videoTrackPublications.values()) {
          if (publication instanceof RemoteTrackPublication) {
            suspendPublication(publication, participant)
          }
        }
      }
    }

    const restoreVideo = () => {
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.videoTrackPublications.values()) {
          if (
            publication instanceof RemoteTrackPublication &&
            suspendedPublications.has(publicationKey(participant, publication))
          ) {
            publication.setSubscribed(true)
          }
        }
      }
      suspendedPublications.clear()
    }

    const syncVisibility = () => {
      document.documentElement.classList.toggle('desktop-background-mode', document.hidden)
      if (document.hidden) suspendVideo()
      else restoreVideo()
    }

    const handleTrackPublished = (
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (document.hidden) suspendPublication(publication, participant)
    }

    const handleTrackSubscribed = (
      _track: unknown,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (document.hidden) suspendPublication(publication, participant)
    }

    document.addEventListener('visibilitychange', syncVisibility)
    room.on(RoomEvent.TrackPublished, handleTrackPublished)
    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
    syncVisibility()

    return () => {
      document.removeEventListener('visibilitychange', syncVisibility)
      room.off(RoomEvent.TrackPublished, handleTrackPublished)
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed)
      restoreVideo()
      document.documentElement.classList.remove('desktop-background-mode')
    }
  }, [room])
}
