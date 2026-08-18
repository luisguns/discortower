import { useEffect, useMemo, useState } from 'react'
import {
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
  RoomEvent,
  Track,
  type Participant,
  type Room,
} from 'livekit-client'
import type { RemoteVoice, ScreenShareLive } from '../types'

export const useRoomSnapshot = (room: Room) => {
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    const refresh = () => setRevision((current) => current + 1)

    room.on(RoomEvent.ParticipantConnected, refresh)
    room.on(RoomEvent.ParticipantDisconnected, refresh)
    room.on(RoomEvent.TrackPublished, refresh)
    room.on(RoomEvent.TrackUnpublished, refresh)
    room.on(RoomEvent.TrackSubscribed, refresh)
    room.on(RoomEvent.TrackUnsubscribed, refresh)
    room.on(RoomEvent.TrackMuted, refresh)
    room.on(RoomEvent.TrackUnmuted, refresh)
    room.on(RoomEvent.LocalTrackPublished, refresh)
    room.on(RoomEvent.LocalTrackUnpublished, refresh)
    room.on(RoomEvent.ActiveSpeakersChanged, refresh)
    room.on(RoomEvent.ParticipantNameChanged, refresh)

    return () => {
      room.off(RoomEvent.ParticipantConnected, refresh)
      room.off(RoomEvent.ParticipantDisconnected, refresh)
      room.off(RoomEvent.TrackPublished, refresh)
      room.off(RoomEvent.TrackUnpublished, refresh)
      room.off(RoomEvent.TrackSubscribed, refresh)
      room.off(RoomEvent.TrackUnsubscribed, refresh)
      room.off(RoomEvent.TrackMuted, refresh)
      room.off(RoomEvent.TrackUnmuted, refresh)
      room.off(RoomEvent.LocalTrackPublished, refresh)
      room.off(RoomEvent.LocalTrackUnpublished, refresh)
      room.off(RoomEvent.ActiveSpeakersChanged, refresh)
      room.off(RoomEvent.ParticipantNameChanged, refresh)
    }
  }, [room])

  return useMemo(() => {
    const activeSpeakerIds = new Set(room.activeSpeakers.map((participant) => participant.identity))
    const participants: Participant[] = [
      room.localParticipant,
      ...room.remoteParticipants.values(),
    ]

    const remoteVoices: RemoteVoice[] = [...room.remoteParticipants.values()].map(
      (participant) => {
        const publication = participant.getTrackPublication(Track.Source.Microphone)
        return {
          id: participant.identity,
          participant,
          track:
            publication?.track instanceof RemoteAudioTrack ? publication.track : undefined,
          muted: publication?.isMuted ?? true,
        }
      },
    )

    const lives: ScreenShareLive[] = []
    const localVideoPublication = room.localParticipant.getTrackPublication(
      Track.Source.ScreenShare,
    )
    if (localVideoPublication?.videoTrack instanceof LocalVideoTrack) {
      lives.push({
        id: `local:${localVideoPublication.trackSid}`,
        participantIdentity: room.localParticipant.identity,
        participantName: room.localParticipant.name || room.localParticipant.identity,
        isLocal: true,
        videoTrack: localVideoPublication.videoTrack,
        muted: false,
      })
    }

    for (const participant of room.remoteParticipants.values()) {
      const videoPublication = participant.getTrackPublication(Track.Source.ScreenShare)
      if (!(videoPublication?.videoTrack instanceof RemoteVideoTrack)) continue
      const audioPublication = participant.getTrackPublication(Track.Source.ScreenShareAudio)
      lives.push({
        id: `${participant.identity}:${videoPublication.trackSid}`,
        participantIdentity: participant.identity,
        participantName: participant.name || participant.identity,
        isLocal: false,
        videoTrack: videoPublication.videoTrack,
        audioTrack:
          audioPublication?.track instanceof RemoteAudioTrack
            ? audioPublication.track
            : undefined,
        muted: audioPublication?.isMuted ?? false,
      })
    }

    return {
      participants,
      remoteVoices,
      lives,
      activeSpeakerIds,
    }
  }, [revision, room])
}
