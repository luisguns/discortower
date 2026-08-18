import { useState } from 'react'
import { CallScreen } from './components/Call/CallScreen'
import { Lobby } from './components/Lobby/Lobby'
import { useLiveKitRoom } from './hooks/useLiveKitRoom'

function App() {
  const liveKit = useLiveKitRoom()
  const [roomCode, setRoomCode] = useState('')

  const join = async (displayName: string, nextRoomCode: string) => {
    const connected = await liveKit.join(nextRoomCode, displayName)
    if (connected) setRoomCode(nextRoomCode)
    return connected
  }

  if (liveKit.room) {
    return (
      <CallScreen
        microphoneError={liveKit.microphoneError}
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
      onJoin={join}
      status={liveKit.status}
    />
  )
}

export default App
