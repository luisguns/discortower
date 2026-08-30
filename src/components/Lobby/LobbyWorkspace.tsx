import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { primeCallSounds } from '../../services/callSounds'
import { normalizeDisplayName } from '../../services/livekit'
import { prepareProfileAvatar } from '../../services/profile'
import type { AccountProfile, ChannelPresence, ChannelSummary, ConnectionStatus, LocalProfile, RecognizedActivity } from '../../types'
import { BrandMark } from '../ui/BrandMark'
import { Icon } from '../ui/Icon'
import { ProfileAvatar } from '../ui/ProfileAvatar'
import { AppSettingsScreen } from '../Settings/AppSettingsScreen'

interface Props {
  status: ConnectionStatus; connectionError: string; initialChannelId: string; channels: ChannelSummary[]; presence: ChannelPresence[]
  canCreateChannel: boolean; profile: AccountProfile; isAdmin: boolean; onOpenAdmin: () => void
  onCreateChannel: (name: string) => Promise<ChannelSummary>; onRenameChannel: (id: string, name: string) => Promise<ChannelSummary>
  onArchiveChannel: (id: string) => Promise<void>; onLogout: () => Promise<void>
  onJoin: (profile: LocalProfile, id: string) => Promise<boolean>; onProfileChange: (profile: LocalProfile) => Promise<AccountProfile | null>
  initialView?: 'home' | 'channel' | 'profile' | 'settings'
  activitySharingEnabled: boolean
  activity?: RecognizedActivity
  canHighQualityScreenShare: boolean
  onActivitySharingChange: (enabled: boolean) => void
}
type View = 'home' | 'channel' | 'profile' | 'settings'
const roleLabel = (role: AccountProfile['role']) => ({ owner: 'Proprietário', manager: 'Gerente', host: 'Host', member: 'Membro' }[role])
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '#'

const ChannelInfoCard = ({ channel, live, onOpen }: { channel: ChannelSummary; live?: ChannelPresence; onOpen: () => void }) => {
  const activities = (live?.participants || []).filter((participant) => participant.activity)
  const participants = live?.participants || []
  return <button onClick={onOpen} type="button">
    <div className="channel-home__card-top"><span className="channel-home__channel-mark">{initials(channel.name)}</span><span className={`channel-home__card-status${channel.participantCount ? ' is-live' : ''}`}>{channel.participantCount ? 'AO VIVO' : 'DISPONÍVEL'}</span></div>
    <h2>{channel.name}</h2>
    <div className={`channel-home__card-activity${activities.length ? ' is-active' : ''}`}><span>{activities.length ? 'AGORA NO CANAL' : 'ATIVIDADE'}</span>{activities.length ? activities.slice(0, 2).map((participant) => <p key={participant.userId || participant.displayName}><b>{participant.activity?.kind === 'game' ? 'Jogando' : 'Usando'} {participant.activity?.displayName}</b><small>{participant.displayName}</small></p>) : <p><b>Nenhuma atividade agora</b></p>}</div>
    <div className="channel-home__card-metrics"><span><Icon name="users" /><strong>{channel.participantCount}</strong><small>na call</small></span><span><Icon name="audio" /><strong>{channel.participantCount ? 1 : 0}</strong><small>call</small></span><span><Icon name="screen" /><strong>{live?.screenSharing ? 'Sim' : 'Não'}</strong><small>tela</small></span></div>
    <div className="channel-home__card-people"><div>{participants.slice(0, 6).map((participant) => <span className="channel-home__member-avatar is-online" key={participant.userId || participant.displayName} title={`${participant.displayName} · na call`}><ProfileAvatar avatarDataUrl={participant.avatarDataUrl} name={participant.displayName} /></span>)}{participants.length > 6 && <b>+{participants.length - 6}</b>}{!participants.length && <small>Ninguém na call agora</small>}</div><span>Ver canal <Icon name="chevron" /></span></div>
  </button>
}

export const LobbyWorkspace = ({ status, connectionError, initialChannelId, initialView, channels, presence, canCreateChannel, canHighQualityScreenShare, profile, isAdmin, activity, activitySharingEnabled, onActivitySharingChange, onOpenAdmin, onCreateChannel, onRenameChannel, onArchiveChannel, onLogout, onJoin, onProfileChange }: Props) => {
  const [view, setView] = useState<View>(initialView || (initialChannelId ? 'channel' : 'home'))
  const [channelId, setChannelId] = useState(initialChannelId)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [renameName, setRenameName] = useState('')
  const [message, setMessage] = useState('')
  const [profileName, setProfileName] = useState(profile.displayName)
  const [profileAvatar, setProfileAvatar] = useState(profile.avatarDataUrl)
  const [profileBusy, setProfileBusy] = useState(false)
  const createInput = useRef<HTMLInputElement>(null)
  const presenceMap = useMemo(() => new Map(presence.map((item) => [item.channelId, item])), [presence])
  const selected = channels.find((channel) => channel.id === channelId)
  const selectedPresence = selected ? presenceMap.get(selected.id) : undefined
  const connecting = status === 'connecting' || status === 'reconnecting'

  useEffect(() => { if (creating) window.setTimeout(() => createInput.current?.focus(), 50) }, [creating])
  useEffect(() => { setMessage(''); setRenameName('') }, [view, channelId])
  useEffect(() => { setProfileName(profile.displayName); setProfileAvatar(profile.avatarDataUrl) }, [profile])
  useEffect(() => { if (!initialView && initialChannelId && channels.some((channel) => channel.id === initialChannelId)) { setChannelId(initialChannelId); setView('channel') } }, [channels, initialChannelId, initialView])

  const openChannel = (id: string) => { setChannelId(id); setView('channel') }
  const create = async (event: FormEvent) => { event.preventDefault(); if (!newName.trim()) return; try { const channel = await onCreateChannel(newName.trim()); setNewName(''); setCreating(false); openChannel(channel.id) } catch { setMessage('Não foi possível criar esse canal.') } }
  const rename = async (event: FormEvent) => { event.preventDefault(); if (!selected || !renameName.trim()) return; try { await onRenameChannel(selected.id, renameName.trim()); setRenameName('') } catch { setMessage('Não foi possível renomear esse canal.') } }
  const archive = async () => { if (!selected || !window.confirm(`Arquivar ${selected.name}?`)) return; try { await onArchiveChannel(selected.id); setChannelId(''); setView('home') } catch { setMessage('Não foi possível arquivar esse canal.') } }
  const join = async () => { if (!selected) return; const local = { displayName: normalizeDisplayName(profile.displayName), avatarDataUrl: profile.avatarDataUrl }; if (!local.displayName) { setMessage('Seu perfil ainda não possui um nome.'); return } primeCallSounds(); await onJoin(local, selected.id) }
  const chooseAvatar = async (event: ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; try { setProfileBusy(true); setProfileAvatar(await prepareProfileAvatar(file)); setMessage('') } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível preparar essa imagem.') } finally { setProfileBusy(false) } }
  const saveProfile = async (event: FormEvent) => { event.preventDefault(); const displayName = normalizeDisplayName(profileName); if (!displayName) return setMessage('Informe um nome de usuário.'); setProfileBusy(true); const saved = await onProfileChange({ displayName, avatarDataUrl: profileAvatar }); setProfileBusy(false); if (saved) { setMessage(''); setView('home') } else setMessage('Não foi possível salvar seu perfil agora.') }

  return <main className="channel-home"><div className="channel-home__grid" aria-hidden="true" />
    <aside className="channel-home__sidebar"><header className="channel-home__brand"><BrandMark /><div><p>PRIVATE COMMS</p><strong>DISCORTOWER</strong></div></header>
      <button className={`channel-home__home-link${view === 'home' ? ' is-active' : ''}`} onClick={() => setView('home')} type="button"><span><Icon name="layout" /></span><strong>Home</strong><small>Visão geral</small></button>
      <div className="channel-home__channel-heading"><span>Seus canais</span><div><b>{channels.length}</b>{canCreateChannel && <button aria-label="Criar novo canal" className={creating ? 'is-active' : ''} onClick={() => setCreating((value) => !value)} type="button">+</button>}</div></div>
      <nav className="channel-home__channel-list">{channels.map((channel) => <button className={view === 'channel' && channel.id === channelId ? 'is-active' : ''} key={channel.id} onClick={() => openChannel(channel.id)} type="button"><span className="channel-home__channel-mark">{initials(channel.name)}</span><span className="channel-home__channel-copy"><strong>{channel.name}</strong><small>{channel.participantCount ? `${channel.participantCount} na call` : 'Canal disponível'}</small></span><span className={`channel-home__presence${channel.participantCount ? ' is-live' : ''}`} /></button>)}</nav>
      {creating && <form className="channel-home__creator" onSubmit={(event) => void create(event)}><label>Novo canal</label><input maxLength={48} onChange={(event) => setNewName(event.target.value)} placeholder="Ex.: Resenha da noite" ref={createInput} value={newName} /><div><button onClick={() => setCreating(false)} type="button">Cancelar</button><button disabled={!newName.trim()} type="submit">Criar</button></div></form>}
      <footer className="call-sidebar-profile"><button className="call-sidebar-profile__identity" onClick={() => setView('profile')} type="button"><ProfileAvatar avatarDataUrl={profile.avatarDataUrl} name={profile.displayName || 'Você'} /><span><strong>{profile.displayName || 'Seu perfil'}</strong><small className={activity ? 'has-activity' : ''}>{activity?.iconDataUrl && <img alt="" src={activity.iconDataUrl} />}{activity ? `${activity.kind === 'game' ? 'Jogando' : 'Usando'} ${activity.displayName}` : `${roleLabel(profile.role)} · editar perfil`}</small></span><Icon name="chevron" /></button><button aria-label="Abrir configurações" className={view === 'settings' ? 'is-active' : ''} onClick={() => setView('settings')} title="Configurações" type="button"><Icon name="settings" /></button></footer>
    </aside>
    <section className="channel-home__main"><header className="channel-home__topbar"><div><span className="channel-home__secure-dot" /> Sessão protegida</div><nav>{isAdmin && <button onClick={onOpenAdmin} type="button"><Icon name="settings" /> Painel admin</button>}<button onClick={() => void onLogout()} type="button">Sair</button></nav></header>
      {view === 'home' && <div className="channel-home__dashboard"><header><p className="eyebrow">SUA BASE DE CONVERSAS</p><h1>Boa noite, <span>{profile.displayName.split(/\s+/)[0] || 'você'}.</span></h1><p>Veja rapidamente onde o pessoal está e o que está acontecendo agora.</p></header><div className="channel-home__cards">{channels.map((channel) => <ChannelInfoCard channel={channel} key={channel.id} live={presenceMap.get(channel.id)} onOpen={() => openChannel(channel.id)} />)}{!channels.length && <div className="channel-home__dashboard-empty"><BrandMark /><h2>Ainda não há canais.</h2><p>{canCreateChannel ? 'Crie o primeiro pelo botão + na barra lateral.' : 'Assim que um host criar um, ele aparecerá aqui.'}</p></div>}</div></div>}
      {view === 'channel' && selected && <div className="channel-home__content"><div className="channel-home__ambient"><span>{initials(selected.name)}</span></div><div className="channel-home__channel-state"><span className={selected.participantCount ? 'is-live' : ''} />{selected.participantCount ? 'Call em andamento' : 'Pronto para conversar'}</div><p className="eyebrow">CANAL SELECIONADO</p><h1>{selected.name}</h1><p className="channel-home__description">Entre quando quiser. O canal fica salvo e a call só existe enquanto alguém estiver por aqui.</p><div className="channel-home__stats"><div><Icon name="users" /><span><strong>{selected.participantCount}</strong><small>online agora</small></span></div><div><Icon name="audio" /><span><strong>{selected.participantCount ? 'Ativa' : 'Silenciosa'}</strong><small>call do canal</small></span></div><div><Icon name="screen" /><span><strong>{selectedPresence?.screenSharing ? 'Transmitindo' : 'Sem transmissão'}</strong><small>compartilhamento</small></span></div></div>
        <section className="channel-home__members"><header><span>Na call agora</span><b>{selectedPresence?.participants.length || 0}</b></header>{selectedPresence?.participants.length ? <div>{selectedPresence.participants.map((p) => <article key={p.userId || `${p.displayName}-${p.joinedAt}`}><ProfileAvatar avatarDataUrl={p.avatarDataUrl} name={p.displayName} /><span><strong>{p.displayName}</strong><small>{p.activity ? `${p.activity.kind === 'game' ? 'Jogando' : 'Usando'} ${p.activity.displayName}` : 'Disponível na call'}</small></span>{p.screenSharing && <em><Icon name="screen" /> Tela</em>}</article>)}</div> : <p>Ninguém entrou nesta call ainda.</p>}</section>
        {(message || connectionError) && <div className="inline-error channel-home__error"><Icon name="warning" /><span>{message || connectionError}</span></div>}<button className="channel-home__join" disabled={connecting} onClick={() => void join()} type="button"><span className="channel-home__join-icon"><Icon name="audio" /></span><span><strong>{connecting ? 'Entrando…' : 'Entrar na call'}</strong><small>{selected.participantCount ? 'Conectar com o pessoal' : 'Iniciar neste canal'}</small></span><Icon name="chevron" /></button>{selected.canManage && <details className="channel-home__manage"><summary><Icon name="controls" /> Gerenciar canal</summary><div><form onSubmit={(event) => void rename(event)}><input maxLength={48} onChange={(event) => setRenameName(event.target.value)} placeholder={`Renomear ${selected.name}`} value={renameName} /><button disabled={!renameName.trim()} type="submit">Salvar nome</button></form><button className="channel-home__archive" onClick={() => void archive()} type="button">Arquivar canal</button></div></details>}</div>}
      {view === 'profile' && <div className="channel-home__profile-page"><header><p className="eyebrow">IDENTIDADE</p><h1>Seu perfil.</h1><p>É assim que você aparece nos canais e durante as calls.</p></header><form onSubmit={(event) => void saveProfile(event)}><label className="channel-home__avatar-editor"><ProfileAvatar avatarDataUrl={profileAvatar} name={profileName || 'Você'} /><span><strong>Alterar foto</strong><small>PNG, JPG, WEBP ou GIF</small></span><input accept="image/gif,image/jpeg,image/png,image/webp" disabled={profileBusy} onChange={(event) => void chooseAvatar(event)} type="file" /></label><label><span>Nome de usuário</span><input maxLength={48} onChange={(event) => setProfileName(event.target.value)} placeholder="Como devemos te chamar?" value={profileName} /></label>{message && <div className="inline-error"><Icon name="warning" /><span>{message}</span></div>}<div><button onClick={() => setView('home')} type="button">Cancelar</button><button disabled={profileBusy || !profileName.trim()} type="submit">{profileBusy ? 'Salvando…' : 'Salvar perfil'}</button></div></form></div>}
      {view === 'settings' && <AppSettingsScreen activitySharingEnabled={activitySharingEnabled} canHighQualityScreenShare={canHighQualityScreenShare} onActivitySharingChange={onActivitySharingChange} onClose={() => setView('home')} />}
    </section>
  </main>
}
