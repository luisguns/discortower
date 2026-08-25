import { useEffect, useState } from 'react'
import { CallScreen } from './components/Call/CallScreen'
import { Lobby } from './components/Lobby/Lobby'
import { useLiveKitRoom } from './hooks/useLiveKitRoom'
import { getRoomCodeFromUrl, replaceRoomCodeInCurrentUrl } from './services/livekit'
import type { LocalProfile } from './types'

function App() {
  const liveKit = useLiveKitRoom()
  const [roomCode, setRoomCode] = useState(getRoomCodeFromUrl)

  useEffect(() => {
    const desktop = window.fordKallDesktop
    if (!desktop) return
    desktop.setInCall(Boolean(liveKit.room))
    return () => desktop.setInCall(false)
  }, [liveKit.room])

  useEffect(() => {
    const desktop = window.fordKallDesktop
    if (!desktop) return
    return desktop.onOpenRoom((nextRoomCode) => {
      if (liveKit.room) return
      setRoomCode(nextRoomCode)
      replaceRoomCodeInCurrentUrl(nextRoomCode)
    })
  }, [liveKit.room])

  const join = async (profile: LocalProfile, nextRoomCode: string) => {
    const connected = await liveKit.join(nextRoomCode, profile)
    if (connected) {
      setRoomCode(nextRoomCode)
      replaceRoomCodeInCurrentUrl(nextRoomCode)
    }
    return connected
  }

  if (liveKit.room) {
    return (
      <CallScreen
        microphoneError={liveKit.microphoneError}
        microphoneStarting={liveKit.microphoneStarting}
        onLeave={liveKit.leave}
        onMicrophoneErrorChange={liveKit.setMicrophoneError}
        room={liveKit.room}
        roomCode={roomCode}
        status={liveKit.status}
      />
    )
  }

  return (
    <Lobby
      connectionError={liveKit.error}
      initialRoomCode={roomCode}
      onJoin={join}
      status={liveKit.status}
    />
  )
}

export default App
