import { useCallback, useEffect, useState } from 'react'
import { AudioPresets, RoomEvent, Track, type Room } from 'livekit-client'
import { streamQualityPresets } from '../services/livekit'
import type { StreamQualityId } from '../types'

export const useScreenShare = (room: Room, quality: StreamQualityId) => {
  const [isSharing, setIsSharing] = useState(room.localParticipant.isScreenShareEnabled)
  const [isStarting, setIsStarting] = useState(false)
  const [hasAudio, setHasAudio] = useState(
    Boolean(room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)),
  )
  const [error, setError] = useState('')

  const syncState = useCallback(() => {
    setIsSharing(room.localParticipant.isScreenShareEnabled)
    setHasAudio(
      Boolean(room.localParticipant.getTrackPublication(Track.Source.ScreenShareAudio)),
    )
  }, [room])

  useEffect(() => {
    room.on(RoomEvent.LocalTrackPublished, syncState)
    room.on(RoomEvent.LocalTrackUnpublished, syncState)
    return () => {
      room.off(RoomEvent.LocalTrackPublished, syncState)
      room.off(RoomEvent.LocalTrackUnpublished, syncState)
    }
  }, [room, syncState])

  const start = useCallback(async () => {
    setIsStarting(true)
    setError('')
    const { preset } = streamQualityPresets[quality]
    try {
      await room.localParticipant.setScreenShareEnabled(
        true,
        {
          audio: true,
          resolution: preset.resolution,
          contentHint: quality === '1080p60' ? 'motion' : 'detail',
          surfaceSwitching: 'include',
          systemAudio: 'include',
        },
        {
          screenShareEncoding: preset.encoding,
          audioPreset: AudioPresets.musicHighQualityStereo,
          dtx: false,
          forceStereo: true,
          simulcast: true,
        },
      )
      syncState()
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === 'NotAllowedError') {
        setError('Compartilhamento cancelado ou bloqueado pelo navegador.')
      } else {
        setError('Não foi possível iniciar a transmissão de tela.')
      }
    } finally {
      setIsStarting(false)
    }
  }, [quality, room, syncState])

  const stop = useCallback(async () => {
    setIsStarting(true)
    setError('')
    try {
      await room.localParticipant.setScreenShareEnabled(false)
      syncState()
    } catch {
      setError('Não foi possível encerrar a transmissão.')
    } finally {
      setIsStarting(false)
    }
  }, [room, syncState])

  return { isSharing, isStarting, hasAudio, error, start, stop }
}
