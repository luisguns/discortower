import { useEffect, useState } from 'react'
import { AccountDisabledScreen, AuthLoadingScreen, LoginScreen } from './auth/LoginScreen'
import { useAuth } from './auth/AuthProvider'
import { InviteCompletionScreen } from './auth/InviteCompletionScreen'
import { AdminPanel } from './admin/AdminPanel'
import { CallScreen } from './components/Call/CallScreen'
import { Lobby } from './components/Lobby/Lobby'
import { useLiveKitRoom } from './hooks/useLiveKitRoom'
import { getRoomCodeFromUrl, replaceRoomCodeInCurrentUrl } from './services/livekit'
import type { LocalProfile } from './types'

function App() {
  const auth = useAuth()
  const liveKit = useLiveKitRoom()
  const [roomCode, setRoomCode] = useState(getRoomCodeFromUrl)
  const [adminOpen, setAdminOpen] = useState(false)

  useEffect(() => {
    if (auth.status === 'authenticated') return
    if (liveKit.room) void liveKit.leave()
    setAdminOpen(false)
  }, [auth.status, liveKit.leave, liveKit.room])

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

  const logout = async () => {
    await liveKit.leave()
    await auth.signOut()
  }

  const join = async (profile: LocalProfile, nextRoomCode: string) => {
    const savedProfile = await auth.updateProfile(profile)
    if (!savedProfile) return false
    const connected = await liveKit.join(nextRoomCode, profile)
    if (connected) {
      setRoomCode(nextRoomCode)
      replaceRoomCodeInCurrentUrl(nextRoomCode)
    }
    return connected
  }

  if (auth.status === 'initializing') return <AuthLoadingScreen />
  if (auth.status === 'disabled') return <AccountDisabledScreen onSignOut={auth.signOut} />
  if (auth.status !== 'authenticated' || !auth.access) {
    return <LoginScreen error={auth.status === 'error' ? auth.error : undefined} onLogin={auth.signIn} onResetPassword={auth.resetPassword} />
  }

  if (auth.credentialSetup) {
    return <InviteCompletionScreen mode={auth.credentialSetup} onComplete={auth.completeCredentialSetup} onLogout={logout} />
  }

  if (adminOpen && auth.access.isAdmin) {
    return <AdminPanel currentUser={auth.access.profile} onClose={() => setAdminOpen(false)} onLogout={logout} />
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
        onLogout={logout}
      />
    )
  }

  return (
    <Lobby
      connectionError={liveKit.error || auth.error}
      initialRoomCode={roomCode}
      isAdmin={auth.access.isAdmin}
      onLogout={logout}
      onOpenAdmin={() => setAdminOpen(true)}
      onJoin={join}
      onProfileChange={async (profile) => { await auth.updateProfile(profile) }}
      profile={auth.access.profile}
      status={liveKit.status}
    />
  )
}

export default App
