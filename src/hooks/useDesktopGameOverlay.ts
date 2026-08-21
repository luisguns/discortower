import { useEffect } from 'react'
import { RoomEvent, Track, type Room } from 'livekit-client'

export const useDesktopGameOverlay = (room: Room, enabled: boolean) => {
  useEffect(() => {
    const desktop = window.fordKallDesktop
    if (!desktop || desktop.platform !== 'win32') return

    const publishState = () => {
      const activeSpeakers = new Set(
        room.activeSpeakers.map((participant) => participant.identity),
      )
      const participants = [
        room.localParticipant,
        ...room.remoteParticipants.values(),
      ].map((participant) => ({
        id: participant.identity,
        name: participant.name || participant.identity,
        isLocal: participant === room.localParticipant,
        muted: participant.getTrackPublication(Track.Source.Microphone)?.isMuted ?? true,
        speaking: activeSpeakers.has(participant.identity),
      }))

      desktop.setGameOverlayState({ enabled, participants })
    }

    const events = [
      RoomEvent.ParticipantConnected,
      RoomEvent.ParticipantDisconnected,
      RoomEvent.ParticipantNameChanged,
      RoomEvent.TrackMuted,
      RoomEvent.TrackUnmuted,
      RoomEvent.TrackPublished,
      RoomEvent.TrackUnpublished,
      RoomEvent.LocalTrackPublished,
      RoomEvent.LocalTrackUnpublished,
      RoomEvent.ActiveSpeakersChanged,
    ] as const

    events.forEach((event) => room.on(event, publishState))
    publishState()

    return () => {
      events.forEach((event) => room.off(event, publishState))
      desktop.setGameOverlayState({ enabled: false, participants: [] })
    }
  }, [enabled, room])
}
