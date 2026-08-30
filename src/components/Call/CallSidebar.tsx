import type { AccountProfile, ChannelSummary, RecognizedActivity } from '../../types'
import { BrandMark } from '../ui/BrandMark'
import { Icon } from '../ui/Icon'
import { ProfileAvatar } from '../ui/ProfileAvatar'

interface Props {
  activity?: RecognizedActivity
  activitySharingEnabled: boolean
  channels: ChannelSummary[]
  currentChannelId: string
  profile: AccountProfile
  settingsOpen: boolean
  onOpenProfile: () => void
  onSettingsToggle: () => void
}

const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '#'
const roleLabel = (role: AccountProfile['role']) => ({ owner: 'Proprietário', manager: 'Gerente', host: 'Host', member: 'Membro' }[role])

export const CallSidebar = ({ activity, activitySharingEnabled, channels, currentChannelId, profile, settingsOpen, onOpenProfile, onSettingsToggle }: Props) => <aside className="channel-home__sidebar call-app-sidebar">
  <header className="channel-home__brand"><BrandMark /><div><p>PRIVATE COMMS</p><strong>DISCORTOWER</strong></div></header>
  <button className="channel-home__home-link" disabled title="Saia da call para voltar à Home" type="button"><span><Icon name="layout" /></span><strong>Home</strong><small>Call em andamento</small></button>
  <div className="channel-home__channel-heading"><span>Seus canais</span><div><b>{channels.length}</b></div></div>
  <nav className="channel-home__channel-list" aria-label="Canais disponíveis">
    {channels.map((channel) => <button className={channel.id === currentChannelId ? 'is-active' : ''} disabled={channel.id !== currentChannelId} key={channel.id} title={channel.id !== currentChannelId ? 'Saia da call para trocar de canal' : channel.name} type="button"><span className="channel-home__channel-mark">{initials(channel.name)}</span><span className="channel-home__channel-copy"><strong>{channel.name}</strong><small>{channel.id === currentChannelId ? 'Você está nesta call' : channel.participantCount ? `${channel.participantCount} na call` : 'Canal disponível'}</small></span><span className={`channel-home__presence${channel.participantCount ? ' is-live' : ''}`} /></button>)}
  </nav>
  <footer className="call-sidebar-profile"><button className="call-sidebar-profile__identity" onClick={onOpenProfile} title="Abrir perfil após sair da call" type="button"><ProfileAvatar avatarDataUrl={profile.avatarDataUrl} name={profile.displayName || 'Você'} /><span><strong>{profile.displayName || 'Seu perfil'}</strong><small className={activitySharingEnabled && activity ? 'has-activity' : ''}>{activitySharingEnabled && activity?.iconDataUrl && <img alt="" src={activity.iconDataUrl} />}{activitySharingEnabled && activity ? `${activity.kind === 'game' ? 'Jogando' : 'Usando'} ${activity.displayName}` : roleLabel(profile.role)}</small></span><Icon name="chevron" /></button><button aria-label="Configurações de atividade" className={settingsOpen ? 'is-active' : ''} onClick={onSettingsToggle} title="Configurações" type="button"><Icon name="settings" /></button></footer>
</aside>
