import { useState } from 'react'
import type { AccountProfile, ChannelPresence, ChannelSummary, RecognizedActivity } from '../../types'
import { BrandMark } from '../ui/BrandMark'
import { Icon } from '../ui/Icon'
import { ProfileAvatar } from '../ui/ProfileAvatar'
import { StyledProfileName } from '../ui/StyledProfileName'

interface Props {
  activity?: RecognizedActivity
  activitySharingEnabled: boolean
  channels: ChannelSummary[]
  currentCallId: string
  currentChannelId: string
  presence?: ChannelPresence
  profile: AccountProfile
  settingsOpen: boolean
  onOpenProfile: () => void
  onSettingsToggle: () => void
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '#'
const roleLabel = (role: AccountProfile['role']) => ({ owner: 'Proprietário', manager: 'Gerente', host: 'Host', member: 'Membro' }[role])

export const CallSidebar = ({ activity, activitySharingEnabled, channels, currentCallId, currentChannelId, presence, profile, settingsOpen, onOpenProfile, onSettingsToggle }: Props) => {
  const [callsCollapsed, setCallsCollapsed] = useState(false)
  const currentChannel = channels.find((channel) => channel.id === currentChannelId)
  const otherChannels = channels.filter((channel) => channel.id !== currentChannelId)

  return <aside className="channel-home__sidebar call-app-sidebar">
    <header className="channel-home__brand"><BrandMark /><div><p>PRIVATE COMMS</p><strong>SPLOTYS</strong></div></header>
    <button className="channel-home__home-link" disabled title="Saia da call para voltar à Home" type="button"><span><Icon name="layout" /></span><strong>Home</strong><small>Call em andamento</small></button>

    {currentChannel && <section className={`call-sidebar-channel${callsCollapsed ? ' is-collapsed' : ''}`}>
      <div className="call-sidebar-channel__current"><span className="channel-home__channel-mark">{initials(currentChannel.name)}</span><span><small>CANAL ATUAL</small><strong>{currentChannel.name}</strong></span><i /></div>
      <button aria-expanded={!callsCollapsed} className="call-sidebar-channel__toggle" onClick={() => setCallsCollapsed((value) => !value)} type="button"><span><Icon name="audio" /> Calls</span><b>{currentChannel.calls?.length || 0}</b><Icon name="chevron" /></button>
      {!callsCollapsed && <nav className="call-sidebar-channel__calls" aria-label={`Calls de ${currentChannel.name}`}>
        {(currentChannel.calls || []).map((call) => { const participantCount = presence?.calls.find((item) => item.callId === call.id)?.participantCount ?? call.participantCount; return <button className={call.id === currentCallId ? 'is-active' : ''} disabled key={call.id} title={call.id === currentCallId ? 'Você está nesta call' : 'Saia da call atual para trocar'} type="button"><span className="call-sidebar-channel__call-icon"><Icon name="audio" /></span><span><strong>{call.name}</strong><small>{call.id === currentCallId ? 'Você está aqui' : participantCount ? `${participantCount} conversando` : 'Disponível'}</small></span>{call.id === currentCallId ? <i className="is-live" /> : participantCount > 0 && <b>{participantCount}</b>}</button> })}
        {!currentChannel.calls?.length && <div className="call-sidebar-channel__empty">Nenhuma call neste canal.</div>}
      </nav>}
    </section>}

    <div className="channel-home__channel-heading"><span>Outros canais</span><div><b>{otherChannels.length}</b></div></div>
    <nav className="channel-home__channel-list" aria-label="Outros canais disponíveis">
      {otherChannels.map((channel) => <button disabled key={channel.id} title="Saia da call para trocar de canal" type="button"><span className="channel-home__channel-mark">{initials(channel.name)}</span><span className="channel-home__channel-copy"><strong>{channel.name}</strong><small>{channel.participantCount ? `${channel.participantCount} na call` : 'Canal disponível'}</small></span><span className={`channel-home__presence${channel.participantCount ? ' is-live' : ''}`} /></button>)}
    </nav>
    <footer className="call-sidebar-profile"><button className="call-sidebar-profile__identity" onClick={onOpenProfile} title="Abrir perfil após sair da call" type="button"><ProfileAvatar avatarDataUrl={profile.avatarDataUrl} name={profile.displayName || 'Você'} /><span><StyledProfileName style={profile.nameStyle}>{profile.displayName || 'Seu perfil'}</StyledProfileName><small className={activitySharingEnabled && activity ? 'has-activity' : ''}>{activitySharingEnabled && activity?.iconDataUrl && <img alt="" src={activity.iconDataUrl} />}{activitySharingEnabled && activity ? `${activity.kind === 'game' ? 'Jogando' : 'Usando'} ${activity.displayName}` : roleLabel(profile.role)}</small></span><Icon name="chevron" /></button><button aria-label="Configurações de atividade" className={settingsOpen ? 'is-active' : ''} onClick={onSettingsToggle} title="Configurações" type="button"><Icon name="settings" /></button></footer>
  </aside>
}
