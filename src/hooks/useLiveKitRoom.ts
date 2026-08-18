import { useCallback, useEffect, useRef, useState } from 'react'
import { ConnectionState, RoomEvent, type Room } from 'livekit-client'
import {
  createLiveKitRoom,
  fetchConnectionDetails,
  friendlyConnectionError,
  friendlyMicrophoneError,
} from '../services/livekit'
import { saveDisplayName } from '../storage/preferences'
import type { ConnectionStatus } from '../types'

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
  const roomRef = useRef<Room | null>(null)
  const leavingRef = useRef(false)

  const leave = useCallback(async () => {
    const activeRoom = roomRef.current
    leavingRef.current = true
    roomRef.current = null
    setRoom(null)
    setStatus('disconnected')
    setError('')
    setMicrophoneError('')

    if (activeRoom) {
      activeRoom.removeAllListeners()
      await activeRoom.disconnect(true)
    }

    leavingRef.current = false
  }, [])

  const join = useCallback(async (roomCode: string, displayName: string) => {
    setError('')
    setMicrophoneError('')
    setStatus('connecting')
    leavingRef.current = false

    const nextRoom = createLiveKitRoom()
    roomRef.current = nextRoom

    const handleConnectionState = (state: ConnectionState) => {
      setStatus(toConnectionStatus(state))
    }
    const handleDisconnected = () => {
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

    try {
      const { serverUrl, participantToken } = await fetchConnectionDetails(
        roomCode,
        displayName,
      )
      await nextRoom.connect(serverUrl, participantToken)

      try {
        await nextRoom.localParticipant.setMicrophoneEnabled(true)
      } catch (microphoneFailure) {
        setMicrophoneError(friendlyMicrophoneError(microphoneFailure))
      }

      saveDisplayName(displayName)
      setRoom(nextRoom)
      setStatus('connected')
      return true
    } catch (connectionFailure) {
      nextRoom.removeAllListeners()
      await nextRoom.disconnect(true)
      if (roomRef.current === nextRoom) roomRef.current = null
      setRoom(null)
      setStatus('error')
      setError(friendlyConnectionError(connectionFailure))
      return false
    }
  }, [])

  useEffect(
    () => () => {
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
    setMicrophoneError,
    join,
    leave,
  }
}
