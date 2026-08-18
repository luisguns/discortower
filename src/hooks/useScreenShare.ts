import { useCallback, useEffect, useRef, useState } from 'react'
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
  const requestRef = useRef(0)
  const pendingRef = useRef(false)

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

  useEffect(
    () => () => {
      requestRef.current += 1
      if (room.localParticipant.isScreenShareEnabled) {
        void room.localParticipant.setScreenShareEnabled(false).catch(() => undefined)
      }
    },
    [room],
  )

  const clearError = useCallback(() => setError(''), [])

  const start = useCallback(async () => {
    if (!isSupported) {
      setError('Este navegador móvel não oferece compartilhamento de tela para páginas web. Você ainda pode assistir às transmissões e usar a câmera.')
      return
    }

    if (pendingRef.current) {
      setIsStarting(false)
      setError('O seletor de tela anterior ainda está aberto. Feche-o ou pressione Esc antes de tentar novamente.')
      return
    }

    const requestId = ++requestRef.current
    pendingRef.current = true
    setIsStarting(true)
    setError('')
    const { preset } = streamQualityPresets[quality]
    const shareOperation = room.localParticipant.setScreenShareEnabled(
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

    let timeoutId = 0
    const outcome = await Promise.race([
      shareOperation.then(
        () => ({ kind: 'success' as const }),
        (shareError: unknown) => ({ kind: 'error' as const, shareError }),
      ),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        timeoutId = window.setTimeout(() => resolve({ kind: 'timeout' }), 15_000)
      }),
    ])

    if (outcome.kind === 'timeout') {
      setIsStarting(false)
      setError('O Chrome não concluiu o seletor de tela. Feche a janela de seleção ou pressione Esc; o botão já foi liberado.')

      // Browsers do not expose a way to cancel a getDisplayMedia prompt. If it
      // eventually resolves, immediately unpublish it so a timed-out request
      // never starts sharing as a surprise.
      void shareOperation
        .then(async () => {
          if (room.localParticipant.isScreenShareEnabled) {
            await room.localParticipant.setScreenShareEnabled(false)
          }
        })
        .catch(() => undefined)
        .finally(() => {
          pendingRef.current = false
          if (requestRef.current === requestId) syncState()
        })
      return
    }

    window.clearTimeout(timeoutId)
    pendingRef.current = false
    if (requestRef.current !== requestId) return

    if (outcome.kind === 'success') {
      syncState()
    } else {
      const { shareError } = outcome
      if (shareError instanceof DOMException && shareError.name === 'NotAllowedError') {
        setError('Compartilhamento cancelado ou bloqueado pelo navegador.')
      } else if (shareError instanceof DOMException && shareError.name === 'NotFoundError') {
        setError('Este dispositivo não ofereceu nenhuma tela para compartilhar. Em celulares, essa função depende do navegador e do sistema.')
      } else if (shareError instanceof TypeError) {
        setError('O navegador não conseguiu iniciar a captura de tela neste dispositivo.')
      } else {
        setError('Não foi possível iniciar a transmissão de tela.')
      }
    }

    setIsStarting(false)
  }, [isSupported, quality, room, syncState])

  const stop = useCallback(async () => {
    if (pendingRef.current) {
      setIsStarting(false)
      setError('Feche o seletor de tela que ainda está aberto antes de encerrar ou iniciar outra transmissão.')
      return
    }

    const requestId = ++requestRef.current
    pendingRef.current = true
    setIsStarting(true)
    setError('')
    const stopOperation = room.localParticipant.setScreenShareEnabled(false)
    let timeoutId = 0
    const outcome = await Promise.race([
      stopOperation.then(
        () => ({ kind: 'success' as const }),
        () => ({ kind: 'error' as const }),
      ),
      new Promise<{ kind: 'timeout' }>((resolve) => {
        timeoutId = window.setTimeout(() => resolve({ kind: 'timeout' }), 8_000)
      }),
    ])

    if (outcome.kind === 'timeout') {
      setError('O navegador demorou para encerrar a transmissão. O controle foi liberado para você tentar novamente.')
      void stopOperation
        .catch(() => undefined)
        .finally(() => {
          pendingRef.current = false
          if (requestRef.current === requestId) syncState()
        })
    } else {
      window.clearTimeout(timeoutId)
      pendingRef.current = false
      if (outcome.kind === 'success') {
        syncState()
      } else {
        setError('Não foi possível encerrar a transmissão.')
      }
    }

    if (requestRef.current === requestId) {
      syncState()
      setIsStarting(false)
    }
  }, [room, syncState])

  return {
    isSharing,
    isStarting,
    hasAudio,
    isSupported,
    error,
    clearError,
    start,
    stop,
  }
}
