import { useCallback, useEffect, useRef, useState } from 'react'
import { ConnectionState, RoomEvent, Track, type Room } from '@gunns-dev/control-tower-client'
import {
  createRoom,
  fetchConnectionDetails,
  friendlyConnectionError,
  friendlyMicrophoneError,
} from '../services/livekit'
import { saveLocalProfile } from '../storage/preferences'
import type { ConnectionStatus, LocalProfile } from '../types'
import { microphoneCaptureOptions } from './useMicrophoneProcessing'
import { startMicrophoneCapture } from '../services/microphoneCapture'

const toConnectionStatus = (state: ConnectionState): ConnectionStatus => {
  if (state === ConnectionState.Connecting) return 'connecting'
  if (
    state === ConnectionState.Reconnecting ||
    state === ConnectionState.SignalReconnecting
  ) {
    return 'reconnecting'
  }
  if (state === ConnectionState.Connected) return 'connected'
  return 'disconnected'
}

export const useLiveKitRoom = () => {
  const [room, setRoom] = useState<Room | null>(null)
  const [status, setStatus] = useState<ConnectionStatus>('disconnected')
  const [error, setError] = useState('')
  const [microphoneError, setMicrophoneError] = useState('')
  const [microphoneStarting, setMicrophoneStarting] = useState(false)
  const roomRef = useRef<Room | null>(null)
  const leavingRef = useRef(false)
  const microphoneRequestRef = useRef(0)
  const joinPendingRef = useRef(false)
  const captureRef = useRef<ReturnType<typeof startMicrophoneCapture> | null>(null)

  const leave = useCallback(async () => {
    const activeRoom = roomRef.current
    microphoneRequestRef.current += 1
    joinPendingRef.current = false
    captureRef.current?.cancel()
    captureRef.current = null
    leavingRef.current = true
    roomRef.current = null
    setRoom(null)
    setStatus('disconnected')
    setError('')
    setMicrophoneError('')
    setMicrophoneStarting(false)

    if (activeRoom) {
      activeRoom.removeAllListeners()
      await activeRoom.disconnect(true)
    }

    leavingRef.current = false
  }, [])

  const join = useCallback(async (callId: string, profile: LocalProfile) => {
    if (joinPendingRef.current || roomRef.current) return false
    joinPendingRef.current = true
    const microphoneRequest = ++microphoneRequestRef.current
    const startedAt = performance.now()
    const elapsed = () => Math.round(performance.now() - startedAt)
    setError('')
    setMicrophoneError('')
    setStatus('connecting')
    leavingRef.current = false
    // The user clicked join. Capture locally while authorization and signaling
    // run, but publish only after connect succeeds. No pre-connect audio buffer.
    const capture = startMicrophoneCapture(microphoneCaptureOptions())
    captureRef.current = capture
    let captureMs = 0
    void capture.result.then(() => { captureMs = elapsed() })

    let nextRoom: Room | null = null

    try {
      // Fetch first: the token response carries the RTC provider, which decides
      // whether we instantiate a Control Tower Room or a LiveKit Room.
      const { serverUrl, participantToken, provider } = await fetchConnectionDetails(callId)
      if (microphoneRequestRef.current !== microphoneRequest) return false
      const tokenMs = elapsed()
      const rtcHost = new URL(serverUrl).host
      console.info(`RTC_CONNECTION_DETAILS provider=${provider} host=${rtcHost}`)
      nextRoom = await createRoom(provider, async () => {
        const refreshed = await fetchConnectionDetails(callId)
        if (microphoneRequestRef.current !== microphoneRequest || leavingRef.current) throw new Error('CALL_CANCELLED')
        if (refreshed.provider !== provider || refreshed.serverUrl !== serverUrl) throw new Error('RTC_PROVIDER_CHANGED')
        return refreshed.participantToken
      })
      roomRef.current = nextRoom

      const handleConnectionState = (state: ConnectionState) => {
        if (roomRef.current !== nextRoom) return
        setStatus(toConnectionStatus(state))
      }
      const handleDisconnected = () => {
        if (roomRef.current !== nextRoom) return
        microphoneRequestRef.current += 1
        joinPendingRef.current = false
        capture.cancel()
        setMicrophoneStarting(false)
        if (!leavingRef.current) {
          setError('A conexão com a call foi encerrada. Entre novamente para continuar.')
        }
        if (roomRef.current === nextRoom) {
          roomRef.current = null
          setRoom(null)
        }
        setStatus('disconnected')
      }

      nextRoom.on(RoomEvent.ConnectionStateChanged, handleConnectionState)
      nextRoom.on(RoomEvent.Disconnected, handleDisconnected)

      await nextRoom.connect(serverUrl, participantToken)
      if (microphoneRequestRef.current !== microphoneRequest) {
        nextRoom.removeAllListeners()
        await nextRoom.disconnect(true)
        return false
      }
      const connectedMs = elapsed()
      console.info(`RTC_JOIN_TIMING provider=${provider} token_ms=${tokenMs} connect_ms=${connectedMs - tokenMs} connected_ms=${connectedMs}`)
      saveLocalProfile(profile)
      setRoom(nextRoom)
      setStatus('connected')

      // Microphone permission belongs to the call controls, not to the room
      // connection. Keeping it detached prevents a native browser prompt from
      // leaving the lobby locked even though LiveKit is already connected.
      setMicrophoneStarting(true)
      let microphoneTimedOut = false
      const microphoneTimer = window.setTimeout(() => {
        if (
          microphoneRequestRef.current === microphoneRequest &&
          roomRef.current === nextRoom
        ) {
          microphoneTimedOut = true
          capture.cancel()
          setMicrophoneStarting(false)
          setMicrophoneError('A permissão do microfone continua aberta no navegador. Feche o aviso e tente novamente pelo botão da call.')
        }
      }, 12_000)
      const connectedRoom = nextRoom
      void capture.result
        .then(async ({ track, error: captureError }) => {
          window.clearTimeout(microphoneTimer)
          if (microphoneRequestRef.current !== microphoneRequest || roomRef.current !== connectedRoom || microphoneTimedOut) return
          if (!track) throw captureError || new Error('MICROPHONE_CAPTURE_CANCELLED')
          await connectedRoom.localParticipant.publishTrack(track, { source: Track.Source.Microphone })
          if (microphoneRequestRef.current === microphoneRequest && !microphoneTimedOut) {
            console.info(`RTC_MICROPHONE_TIMING provider=${provider} capture_ms=${captureMs} ready_ms=${elapsed()}`)
          }
        })
        .then(() => {
          if (
            microphoneRequestRef.current === microphoneRequest &&
            roomRef.current === nextRoom && !microphoneTimedOut
          ) {
            setMicrophoneError('')
          }
        })
        .catch((microphoneFailure) => {
          capture.cancel()
          if (
            microphoneRequestRef.current === microphoneRequest &&
            roomRef.current === nextRoom && !microphoneTimedOut
          ) {
            setMicrophoneError(friendlyMicrophoneError(microphoneFailure))
          }
        })
        .finally(() => {
          window.clearTimeout(microphoneTimer)
          if (
            microphoneRequestRef.current === microphoneRequest &&
            roomRef.current === nextRoom
          ) {
            setMicrophoneStarting(false)
          }
        })

      return true
    } catch (connectionFailure) {
      capture.cancel()
      const failureMessage = connectionFailure instanceof Error
        ? connectionFailure.message
        : 'unknown'
      console.warn(`RTC_JOIN_FAILED message=${failureMessage}`)
      if (nextRoom) {
        nextRoom.removeAllListeners()
        await nextRoom.disconnect(true)
        if (roomRef.current === nextRoom) roomRef.current = null
      }
      if (microphoneRequestRef.current === microphoneRequest) {
        setRoom(null)
        setStatus('error')
        setError(friendlyConnectionError(connectionFailure))
      }
      return false
    } finally {
      if (microphoneRequestRef.current === microphoneRequest) joinPendingRef.current = false
    }
  }, [])

  useEffect(
    () => () => {
      microphoneRequestRef.current += 1
      captureRef.current?.cancel()
      const activeRoom = roomRef.current
      if (activeRoom) {
        activeRoom.removeAllListeners()
        void activeRoom.disconnect(true)
        roomRef.current = null
      }
    },
    [],
  )

  return {
    room,
    status,
    error,
    microphoneError,
    microphoneStarting,
    setMicrophoneError,
    join,
    leave,
  }
}
