import { useEffect } from 'react'
import {
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrackPublication,
  type Room,
} from '@gunns-dev/control-tower-client'

const publicationKey = (participant: RemoteParticipant, publication: RemoteTrackPublication) =>
  `${participant.identity}:${publication.source}`

export const useDesktopPerformanceMode = (room: Room) => {
  useEffect(() => {
    if (!window.splotysDesktop) return

    const suspendedPublications = new Set<string>()

    const suspendPublication = (
      publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (publication.kind !== Track.Kind.Video || !publication.isDesired) return
      const track = publication.videoTrack
      if (track && 'attachedElements' in track && track.attachedElements.some((element) =>
        element.ownerDocument.pictureInPictureElement === element ||
        (element.ownerDocument !== document && !element.ownerDocument.hidden),
      )) return
      suspendedPublications.add(publicationKey(participant, publication))
      publication.setEnabled(false)
    }

    const suspendVideo = () => {
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.videoTrackPublications.values()) {
          suspendPublication(publication, participant)
        }
      }
    }

    const restoreVideo = () => {
      for (const participant of room.remoteParticipants.values()) {
        for (const publication of participant.videoTrackPublications.values()) {
          if (suspendedPublications.has(publicationKey(participant, publication))) {
            publication.setEnabled(true)
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
