import { useEffect, useState } from 'react'
import { AccountDisabledScreen, AuthLoadingScreen, LoginScreen } from './auth/LoginScreen'
import { useAuth } from './auth/AuthProvider'
import { InviteCompletionScreen } from './auth/InviteCompletionScreen'
import { AdminPanel } from './admin/AdminPanel'
import { CallScreen } from './components/Call/CallScreen'
import { CallSidebar } from './components/Call/CallSidebar'
import { LobbyWorkspace as Lobby } from './components/Lobby/LobbyWorkspace'
import { AppSettingsScreen } from './components/Settings/AppSettingsScreen'
import { useLiveKitRoom } from './hooks/useLiveKitRoom'
import { useDesktopActivity } from './hooks/useDesktopActivity'
import { getChannelIdFromUrl, replaceChannelIdInCurrentUrl } from './services/livekit'
import { archiveChannel, createChannel, listChannels, renameChannel, subscribeToChannels } from './services/channels'
import { listChannelPresence } from './services/presence'
import { getActivitySharingEnabled, saveActivitySharingEnabled } from './storage/preferences'
import type { ChannelPresence, ChannelSummary, LocalProfile } from './types'

function App() {
  const auth = useAuth()
  const liveKit = useLiveKitRoom()
  const [channelId, setChannelId] = useState(getChannelIdFromUrl)
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [presence, setPresence] = useState<ChannelPresence[]>([])
  const [adminOpen, setAdminOpen] = useState(false)
  const [activitySharingEnabled, setActivitySharingEnabled] = useState(getActivitySharingEnabled)
  const [callSidebarVisible, setCallSidebarVisible] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [lobbyDestination, setLobbyDestination] = useState<'home' | 'profile' | undefined>()
  const [callActivitySettingsOpen, setCallActivitySettingsOpen] = useState(false)

  useEffect(() => {
    if (auth.status !== 'authenticated') return
    let mounted = true
    const load = async () => {
      try {
        const next = await listChannels(auth.access?.userId, auth.access?.capabilities.canManageAllChannels === true)
        if (mounted) setChannels(next)
      } catch { if (mounted) setChannels([]) }
    }
    void load()
    const unsubscribe = subscribeToChannels(() => { window.setTimeout(() => void load(), 200) })
    return () => { mounted = false; unsubscribe() }
  }, [auth.access?.capabilities.canManageAllChannels, auth.access?.userId, auth.status])

  useEffect(() => {
    if (auth.status !== 'authenticated') return
    let mounted = true
    const load = async () => {
      try { const next = await listChannelPresence(); if (mounted) setPresence(next) } catch { /* Presence is supplementary. */ }
    }
    void load()
    const timer = window.setInterval(() => void load(), 15_000)
    return () => { mounted = false; window.clearInterval(timer) }
  }, [auth.status])

  const localActivity = useDesktopActivity(auth.status === 'authenticated', activitySharingEnabled)

  const changeActivitySharing = (enabled: boolean) => {
    setActivitySharingEnabled(enabled)
    saveActivitySharingEnabled(enabled)
  }

  const toggleFullscreen = async () => {
    const next = !fullscreen
    try {
      if (window.fordKallDesktop) setFullscreen(await window.fordKallDesktop.setFullscreen(next))
      else if (next) { await document.documentElement.requestFullscreen(); setFullscreen(true) }
      else { await document.exitFullscreen(); setFullscreen(false) }
    } catch { setFullscreen(false) }
  }

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

  useEffect(() => window.fordKallDesktop?.onFullscreenChange(setFullscreen), [])

  useEffect(() => {
    if (liveKit.room || !fullscreen) return
    if (window.fordKallDesktop) void window.fordKallDesktop.setFullscreen(false)
    else if (document.fullscreenElement) void document.exitFullscreen()
    setFullscreen(false)
  }, [fullscreen, liveKit.room])

  useEffect(() => {
    const desktop = window.fordKallDesktop
    if (!desktop) return
    return desktop.onOpenRoom((nextRoomCode) => {
      if (liveKit.room) return
      if (/^[0-9a-f-]{36}$/i.test(nextRoomCode)) { setChannelId(nextRoomCode); replaceChannelIdInCurrentUrl(nextRoomCode) }
    })
  }, [liveKit.room])

  const logout = async () => {
    await liveKit.leave()
    await auth.signOut()
  }

  const join = async (profile: LocalProfile, nextChannelId: string) => {
    const savedProfile = await auth.updateProfile(profile)
    if (!savedProfile) return false
    const connected = await liveKit.join(nextChannelId, profile)
    if (connected) {
      setLobbyDestination(undefined)
      setCallActivitySettingsOpen(false)
      setChannelId(nextChannelId)
      replaceChannelIdInCurrentUrl(nextChannelId)
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
      <div className={`call-app-layout${callSidebarVisible ? '' : ' is-expanded'}`}>
      {callSidebarVisible && <CallSidebar activity={localActivity} activitySharingEnabled={activitySharingEnabled} channels={channels} currentChannelId={channelId} onOpenProfile={() => { setLobbyDestination('profile'); void liveKit.leave() }} onSettingsToggle={() => setCallActivitySettingsOpen((value) => !value)} profile={auth.access.profile} settingsOpen={callActivitySettingsOpen} />}
      <div className="call-app-main">
      <CallScreen
        microphoneError={liveKit.microphoneError}
        microphoneStarting={liveKit.microphoneStarting}
        onLeave={liveKit.leave}
        onMicrophoneErrorChange={liveKit.setMicrophoneError}
        room={liveKit.room}
        channelId={channelId}
        canHighQualityScreenShare={auth.access.capabilities.canHighQualityScreenShare}
        roomCode={channels.find((channel) => channel.id === channelId)?.name || 'Canal'}
        status={liveKit.status}
        onLogout={logout}
        fullscreen={fullscreen}
        onToggleFullscreen={() => void toggleFullscreen()}
        onToggleSidebar={() => setCallSidebarVisible((value) => !value)}
        sidebarVisible={callSidebarVisible}
      />
      {callActivitySettingsOpen && <div className="call-app-settings-overlay"><AppSettingsScreen activitySharingEnabled={activitySharingEnabled} canHighQualityScreenShare={auth.access.capabilities.canHighQualityScreenShare} onActivitySharingChange={changeActivitySharing} onClose={() => setCallActivitySettingsOpen(false)} /></div>}
      </div>
      </div>
    )
  }

  return (
    <Lobby
      connectionError={liveKit.error || auth.error}
      channels={channels}
      presence={presence}
      canCreateChannel={auth.access.capabilities.canCreateChannel}
      canHighQualityScreenShare={auth.access.capabilities.canHighQualityScreenShare}
      initialChannelId={channelId}
      initialView={lobbyDestination}
      activitySharingEnabled={activitySharingEnabled}
      activity={localActivity}
      isAdmin={auth.access.isAdmin}
      onCreateChannel={async (name) => {
        const channel = await createChannel(name)
        const managedChannel = { ...channel, canManage: true }
        setChannels((current) => [...current, managedChannel].sort((a, b) => a.name.localeCompare(b.name)))
        return managedChannel
      }}
      onRenameChannel={async (id, name) => {
        const channel = await renameChannel(id, name)
        setChannels((current) => current.map((item) => item.id === id ? { ...item, ...channel, canManage: item.canManage } : item).sort((a, b) => a.name.localeCompare(b.name)))
        return channel
      }}
      onArchiveChannel={async (id) => {
        await archiveChannel(id)
        setChannels((current) => current.filter((item) => item.id !== id))
        if (channelId === id) setChannelId('')
      }}
      onLogout={logout}
      onActivitySharingChange={changeActivitySharing}
      onProfileChange={auth.updateProfile}
      onOpenAdmin={() => setAdminOpen(true)}
      onJoin={join}
      profile={auth.access.profile}
      status={liveKit.status}
    />
  )
}

export default App
