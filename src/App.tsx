import { useEffect, useState } from 'react'
import { AccountDisabledScreen, AuthLoadingScreen, LoginScreen } from './auth/LoginScreen'
import { useAuth } from './auth/AuthProvider'
import { InviteCompletionScreen } from './auth/InviteCompletionScreen'
import { UsernameSetupScreen } from './auth/UsernameSetupScreen'
import { AdminPanel } from './admin/AdminPanel'
import { CallScreen } from './components/Call/CallScreen'
import { CallSidebar } from './components/Call/CallSidebar'
import { LandingPage } from './components/Landing/LandingPage'
import { LobbyWorkspace as Lobby } from './components/Lobby/LobbyWorkspace'
import { AppSettingsScreen } from './components/Settings/AppSettingsScreen'
import { useLiveKitRoom } from './hooks/useLiveKitRoom'
import { useDesktopActivity } from './hooks/useDesktopActivity'
import { getChannelIdFromUrl, replaceChannelIdInCurrentUrl } from './services/livekit'
import { acceptChannelInvite, archiveChannel, createCall, createChannel, createChannelInvite, createChannelInviteLink, listChannels, renameChannel, subscribeToChannels } from './services/channels'
import { listChannelPresence } from './services/presence'
import { listSocial, subscribeToSocial } from './services/social'
import { getActivitySharingEnabled, saveActivitySharingEnabled } from './storage/preferences'
import type { ChannelPresence, ChannelSummary, LocalProfile, SocialOverview } from './types'

const emptySocialOverview: SocialOverview = { friends: [], incoming: [], outgoing: [], blocked: [], conversations: [] }
const channelInviteTokenFromUrl = () => typeof window === 'undefined' ? '' : new URL(window.location.href).searchParams.get('invite') || ''
const shouldTryDesktopChannelInvite = () => !window.splotysDesktop && /Windows/i.test(navigator.userAgent) && /^[a-zA-Z0-9_-]{16,256}$/.test(channelInviteTokenFromUrl())

function App() {
  const auth = useAuth()
  const liveKit = useLiveKitRoom()
  const [channelId, setChannelId] = useState(getChannelIdFromUrl)
  const [activeCallId, setActiveCallId] = useState('')
  const [channels, setChannels] = useState<ChannelSummary[]>([])
  const [presence, setPresence] = useState<ChannelPresence[]>([])
  const [social, setSocial] = useState<SocialOverview>(emptySocialOverview)
  const [adminOpen, setAdminOpen] = useState(false)
  const [activitySharingEnabled, setActivitySharingEnabled] = useState(getActivitySharingEnabled)
  const [callSidebarVisible, setCallSidebarVisible] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  const [lobbyDestination, setLobbyDestination] = useState<'home' | 'profile' | undefined>()
  const [callActivitySettingsOpen, setCallActivitySettingsOpen] = useState(false)
  const [desktopInviteToken, setDesktopInviteToken] = useState('')
  const [webChannelInviteReady, setWebChannelInviteReady] = useState(() => !shouldTryDesktopChannelInvite())
  const [webLoginOpen, setWebLoginOpen] = useState(() => {
    if (typeof window === 'undefined' || window.splotysDesktop) return true
    const params = new URL(window.location.href).searchParams
    return params.has('login') || params.has('invite') || params.has('code') || params.has('error')
  })

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
    if (!shouldTryDesktopChannelInvite()) return
    const token = channelInviteTokenFromUrl()
    const historyState = window.history.state && typeof window.history.state === 'object' ? window.history.state : {}
    if (historyState.splotysChannelInviteAppAttempted !== true) {
      window.history.replaceState({ ...historyState, splotysChannelInviteAppAttempted: true }, '', window.location.href)
      window.location.assign(`splotys://invite?token=${encodeURIComponent(token)}`)
    }
    const enableWebFallback = () => {
      if (document.visibilityState === 'visible') setWebChannelInviteReady(true)
      else document.addEventListener('visibilitychange', enableWebFallback, { once: true })
    }
    const timer = window.setTimeout(enableWebFallback, 1400)
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', enableWebFallback) }
  }, [])

  useEffect(() => {
    if (auth.status !== 'authenticated' || typeof window === 'undefined') return
    if (!window.splotysDesktop && !webChannelInviteReady) return
    const invite = desktopInviteToken || new URL(window.location.href).searchParams.get('invite')
    if (!invite) return
    void acceptChannelInvite(invite).then((result) => {
      const url = new URL(window.location.href); url.searchParams.delete('invite'); url.searchParams.set('channel', result.channelId); window.history.replaceState(null, '', url)
      setDesktopInviteToken('')
      setChannelId(result.channelId)
    }).catch(() => { /* lobby surfaces the unavailable invite without leaking its token */ })
  }, [auth.status, desktopInviteToken, webChannelInviteReady])

  useEffect(() => {
    const desktop = window.splotysDesktop
    if (!desktop) return
    void desktop.getInviteToken().then((token) => { if (token) setDesktopInviteToken(token) })
    return desktop.onOpenInvite(setDesktopInviteToken)
  }, [])

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

  const refreshSocial = async () => {
    if (auth.status !== 'authenticated' || !auth.access?.profile.usernameConfigured) { setSocial(emptySocialOverview); return }
    try { setSocial(await listSocial()) } catch { setSocial(emptySocialOverview) }
  }

  useEffect(() => {
    if (auth.status !== 'authenticated' || !auth.access?.profile.usernameConfigured || !auth.access?.userId) { setSocial(emptySocialOverview); return }
    let mounted = true
    const load = async () => { try { const next = await listSocial(); if (mounted) setSocial(next) } catch { if (mounted) setSocial(emptySocialOverview) } }
    void load()
    const unsubscribe = subscribeToSocial(auth.access.userId, () => { window.setTimeout(() => void load(), 120) }, (message) => {
      if (message.senderId === auth.access?.userId || document.visibilityState === 'visible' || typeof Notification === 'undefined' || Notification.permission !== 'granted') return
      try { new Notification('Splotys', { body: message.kind === 'image' ? 'Enviou uma imagem' : 'Nova mensagem' }) } catch { /* Notifications are supplementary. */ }
    })
    return () => { mounted = false; unsubscribe() }
  }, [auth.access?.profile.usernameConfigured, auth.access?.userId, auth.status])

  const localActivity = useDesktopActivity(auth.status === 'authenticated', activitySharingEnabled)

  const changeActivitySharing = (enabled: boolean) => {
    setActivitySharingEnabled(enabled)
    saveActivitySharingEnabled(enabled)
  }

  const toggleFullscreen = async () => {
    const next = !fullscreen
    try {
      if (window.splotysDesktop) setFullscreen(await window.splotysDesktop.setFullscreen(next))
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
    const desktop = window.splotysDesktop
    if (!desktop) return
    desktop.setInCall(Boolean(liveKit.room))
    return () => desktop.setInCall(false)
  }, [liveKit.room])

  useEffect(() => window.splotysDesktop?.onFullscreenChange(setFullscreen), [])

  useEffect(() => {
    if (liveKit.room || !fullscreen) return
    if (window.splotysDesktop) void window.splotysDesktop.setFullscreen(false)
    else if (document.fullscreenElement) void document.exitFullscreen()
    setFullscreen(false)
  }, [fullscreen, liveKit.room])

  useEffect(() => {
    const desktop = window.splotysDesktop
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

  const join = async (profile: LocalProfile, nextCallId: string, nextChannelId?: string) => {
    const savedProfile = await auth.updateProfile(profile)
    if (!savedProfile) return false
    const connected = await liveKit.join(nextCallId, profile)
    if (connected) {
      setLobbyDestination(undefined)
      setCallActivitySettingsOpen(false)
      setChannelId(nextChannelId || channelId)
      setActiveCallId(nextCallId)
      replaceChannelIdInCurrentUrl(nextChannelId || channelId)
    }
    return connected
  }

  if (auth.status === 'initializing') return <AuthLoadingScreen />
  if (auth.status === 'disabled') return <AccountDisabledScreen onSignOut={auth.signOut} />
  if (auth.status !== 'authenticated' || !auth.access) {
    if (!window.splotysDesktop && !webLoginOpen) {
      return <LandingPage onEnter={() => { window.history.replaceState(null, '', '?login=1'); setWebLoginOpen(true) }} />
    }
    return <LoginScreen error={auth.status === 'error' ? auth.error : undefined} onBack={!window.splotysDesktop ? () => { window.history.replaceState(null, '', '/'); setWebLoginOpen(false) } : undefined} onLogin={auth.signIn} onResetPassword={auth.resetPassword} />
  }

  if (auth.credentialSetup) {
    return <InviteCompletionScreen mode={auth.credentialSetup} onComplete={auth.completeCredentialSetup} onLogout={logout} />
  }

  if (!auth.access.profile.usernameConfigured) {
    return <UsernameSetupScreen error={auth.error} onSubmit={async (username) => Boolean(await auth.claimUsername(username))} />
  }

  if (adminOpen && auth.access.isAdmin) {
    return <AdminPanel currentUser={auth.access.profile} onClose={() => setAdminOpen(false)} onLogout={logout} />
  }

  const currentUserId = auth.access.userId
  if (liveKit.room) {
    return (
      <div className={`call-app-layout${callSidebarVisible ? '' : ' is-expanded'}`}>
      {callSidebarVisible && <CallSidebar activity={localActivity} activitySharingEnabled={activitySharingEnabled} channels={channels} currentCallId={activeCallId || presence.find((item) => item.channelId === channelId)?.calls.find((call) => call.participants.some((participant) => participant.userId === currentUserId))?.callId || ''} currentChannelId={channelId} onOpenProfile={() => { setLobbyDestination('profile'); setActiveCallId(''); void liveKit.leave() }} onSettingsToggle={() => setCallActivitySettingsOpen((value) => !value)} presence={presence.find((item) => item.channelId === channelId)} profile={auth.access.profile} settingsOpen={callActivitySettingsOpen} />}
      <div className="call-app-main">
      <CallScreen
        microphoneError={liveKit.microphoneError}
        microphoneStarting={liveKit.microphoneStarting}
        onLeave={async () => { await liveKit.leave(); setActiveCallId('') }}
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
      onCreateCall={async (id, name) => {
        const call = await createCall(id, name)
        setChannels((current) => current.map((item) => item.id === id ? { ...item, calls: [...(item.calls || []), { ...call, canManage: item.canManage }] } : item))
        return call
      }}
      onCreateInvite={async (id) => createChannelInvite(id).then((invite) => createChannelInviteLink(invite.token))}
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
      onUsernameChange={auth.claimUsername}
      onOpenAdmin={() => setAdminOpen(true)}
      onJoin={join}
      profile={auth.access.profile}
      social={social}
      onRefreshSocial={refreshSocial}
      status={liveKit.status}
    />
  )
}

export default App
