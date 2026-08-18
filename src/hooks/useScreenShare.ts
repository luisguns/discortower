import { useCallback, useEffect, useState } from 'react'
import { AudioPresets, RoomEvent, Track, type Room } from 'livekit-client'
import { streamQualityPresets } from '../services/livekit'
import type { StreamQualityId } from '../types'

export const useScreenShare = (room: Room, quality: StreamQualityId) => {
  const isSupported =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function'
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
    if (!isSupported) {
      setError('Este navegador móvel não oferece compartilhamento de tela para páginas web. Você ainda pode assistir às transmissões e usar a câmera.')
      return
    }
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
      } else if (shareError instanceof DOMException && shareError.name === 'NotFoundError') {
        setError('Este dispositivo não ofereceu nenhuma tela para compartilhar. Em celulares, essa função depende do navegador e do sistema.')
      } else if (shareError instanceof TypeError) {
        setError('O navegador não conseguiu iniciar a captura de tela neste dispositivo.')
      } else {
        setError('Não foi possível iniciar a transmissão de tela.')
      }
    } finally {
      setIsStarting(false)
    }
  }, [isSupported, quality, room, syncState])

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

  return { isSharing, isStarting, hasAudio, isSupported, error, start, stop }
}
