import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { primeCallSounds } from '../../services/callSounds'
import { normalizeDisplayName } from '../../services/livekit'
import type { AccountProfile, ChannelSummary, ConnectionStatus, LocalProfile } from '../../types'
import { BrandMark } from '../ui/BrandMark'
import { Icon } from '../ui/Icon'
import { ProfileAvatar } from '../ui/ProfileAvatar'

interface LobbyProps {
  status: ConnectionStatus
  connectionError: string
  initialChannelId: string
  channels: ChannelSummary[]
  canCreateChannel: boolean
  profile: AccountProfile
  isAdmin: boolean
  onOpenAdmin: () => void
  onCreateChannel: (name: string) => Promise<ChannelSummary>
  onRenameChannel: (channelId: string, name: string) => Promise<ChannelSummary>
  onArchiveChannel: (channelId: string) => Promise<void>
  onLogout: () => Promise<void>
  onJoin: (profile: LocalProfile, channelId: string) => Promise<boolean>
}

const roleLabel = (role: AccountProfile['role']) => ({
  owner: 'Proprietário',
  manager: 'Gerente',
  host: 'Host',
  member: 'Membro',
}[role])

const channelInitials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || '#'

export const Lobby = ({ status, connectionError, initialChannelId, channels, canCreateChannel, profile, isAdmin, onOpenAdmin, onCreateChannel, onRenameChannel, onArchiveChannel, onLogout, onJoin }: LobbyProps) => {
  const [channelId, setChannelId] = useState(initialChannelId)
  const [creating, setCreating] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [renameName, setRenameName] = useState('')
  const [validationError, setValidationError] = useState('')
  const createInputRef = useRef<HTMLInputElement>(null)
  const connecting = status === 'connecting' || status === 'reconnecting'

  useEffect(() => {
    setChannelId((current) => {
      if (channels.some((channel) => channel.id === current)) return current
      if (channels.some((channel) => channel.id === initialChannelId)) return initialChannelId
      return channels[0]?.id || ''
    })
  }, [channels, initialChannelId])

  useEffect(() => {
    if (!creating) return
    window.setTimeout(() => createInputRef.current?.focus(), 80)
  }, [creating])

  useEffect(() => {
    setRenameName('')
    setValidationError('')
  }, [channelId])

  const selectedChannel = useMemo(() => channels.find((channel) => channel.id === channelId), [channelId, channels])
  const activeProfile: LocalProfile = { displayName: normalizeDisplayName(profile.displayName), avatarDataUrl: profile.avatarDataUrl }

  const joinChannel = async () => {
    if (!selectedChannel) { setValidationError('Selecione um canal disponível.'); return }
    if (!activeProfile.displayName) { setValidationError('Seu perfil ainda não possui um nome.'); return }
    setValidationError('')
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
    primeCallSounds()
    await onJoin(activeProfile, selectedChannel.id)
  }

  const createSavedChannel = async (event?: FormEvent) => {
    event?.preventDefault()
    const name = newChannelName.trim()
    if (!name) return
    try {
      const channel = await onCreateChannel(name)
      setNewChannelName('')
      setCreating(false)
      setChannelId(channel.id)
      setValidationError('')
    } catch {
      setValidationError('Não foi possível criar esse canal. Use um nome diferente.')
    }
  }

  const renameSelected = async (event: FormEvent) => {
    event.preventDefault()
    if (!selectedChannel || !renameName.trim()) return
    try {
      await onRenameChannel(selectedChannel.id, renameName)
      setRenameName('')
      setValidationError('')
    } catch {
      setValidationError('Não foi possível renomear esse canal.')
    }
  }

  const archiveSelected = async () => {
    if (!selectedChannel || !window.confirm(`Arquivar ${selectedChannel.name}?`)) return
    try {
      await onArchiveChannel(selectedChannel.id)
      setValidationError('')
    } catch {
      setValidationError('Não foi possível arquivar esse canal.')
    }
  }

  return <main className="channel-home">
    <div className="channel-home__grid" aria-hidden="true" />
    <aside className="channel-home__sidebar">
      <header className="channel-home__brand"><BrandMark /><div><p>PRIVATE COMMS</p><strong>DISCORTOWER</strong></div></header>
      <div className="channel-home__channel-heading"><span>Seus canais</span><div><b>{channels.length}</b>{canCreateChannel && <button aria-label="Criar novo canal" aria-pressed={creating} className={creating ? 'is-active' : ''} onClick={() => setCreating((current) => !current)} title="Criar novo canal" type="button">+</button>}</div></div>
      <nav className="channel-home__channel-list" aria-label="Canais disponíveis">
        {channels.map((channel) => <button aria-current={channel.id === channelId ? 'page' : undefined} className={channel.id === channelId ? 'is-active' : ''} key={channel.id} onClick={() => setChannelId(channel.id)} type="button">
          <span className="channel-home__channel-mark">{channelInitials(channel.name)}</span>
          <span className="channel-home__channel-copy"><strong>{channel.name}</strong><small>{channel.participantCount ? `${channel.participantCount} na call` : 'Canal disponível'}</small></span>
          <span className={`channel-home__presence${channel.participantCount ? ' is-live' : ''}`} aria-label={channel.participantCount ? 'Call ativa' : 'Sem call ativa'} />
        </button>)}
        {!channels.length && <div className="channel-home__no-channels"><Icon name="users" /><strong>Nenhum canal ainda</strong><span>{canCreateChannel ? 'Use o + abaixo para abrir o primeiro.' : 'Aguarde um host criar um canal.'}</span></div>}
      </nav>

      {creating && <form className="channel-home__creator" onSubmit={(event) => void createSavedChannel(event)}>
        <label htmlFor="new-channel-name">Novo canal</label>
        <input id="new-channel-name" maxLength={48} onChange={(event) => setNewChannelName(event.target.value)} placeholder="Ex.: Resenha da noite" ref={createInputRef} value={newChannelName} />
        <div><button onClick={() => { setCreating(false); setNewChannelName('') }} type="button">Cancelar</button><button disabled={!newChannelName.trim()} type="submit">Criar</button></div>
      </form>}

      <footer className="channel-home__profile-bar">
        <ProfileAvatar avatarDataUrl={profile.avatarDataUrl} name={profile.displayName || 'Você'} />
        <span><strong>{profile.displayName || 'Seu perfil'}</strong><small>{roleLabel(profile.role)}</small></span>
      </footer>
    </aside>

    <section className="channel-home__main">
      <header className="channel-home__topbar">
        <div><span className="channel-home__secure-dot" /> Sessão protegida</div>
        <nav aria-label="Ações da conta">{isAdmin && <button onClick={onOpenAdmin} type="button"><Icon name="settings" /> Painel admin</button>}<button onClick={() => void onLogout()} type="button">Sair</button></nav>
      </header>

      {selectedChannel ? <div className="channel-home__content">
        <div className="channel-home__ambient" aria-hidden="true"><span>{channelInitials(selectedChannel.name)}</span></div>
        <div className="channel-home__channel-state"><span className={selectedChannel.participantCount ? 'is-live' : ''} />{selectedChannel.participantCount ? 'Call em andamento' : 'Pronto para conversar'}</div>
        <p className="eyebrow">CANAL SELECIONADO</p>
        <h1>{selectedChannel.name}</h1>
        <p className="channel-home__description">Entre quando quiser. O canal fica salvo e a call só existe enquanto alguém estiver por aqui.</p>

        <div className="channel-home__stats">
          <div><Icon name="users" /><span><strong>{selectedChannel.participantCount}</strong><small>{selectedChannel.participantCount === 1 ? 'pessoa na call' : 'pessoas na call'}</small></span></div>
          <div><Icon name="audio" /><span><strong>{selectedChannel.participantCount ? 'Ativa' : 'Silenciosa'}</strong><small>situação agora</small></span></div>
          <div><Icon name="screen" /><span><strong>Protegida</strong><small>acesso por convite</small></span></div>
        </div>

        {(validationError || connectionError) && <div className="inline-error channel-home__error" role="alert"><Icon name="warning" /><span>{validationError || connectionError}</span></div>}
        <button className="channel-home__join" disabled={connecting} onClick={() => void joinChannel()} type="button">{connecting ? <><span className="spinner" /> Entrando…</> : <><span className="channel-home__join-icon"><Icon name="audio" /></span><span><strong>Entrar na call</strong><small>{selectedChannel.participantCount ? 'Conectar com o pessoal' : 'Iniciar neste canal'}</small></span><Icon name="chevron" /></>}</button>

        {selectedChannel.canManage && <details className="channel-home__manage">
          <summary><Icon name="controls" /> Gerenciar canal</summary>
          <div><form onSubmit={(event) => void renameSelected(event)}><input aria-label="Novo nome do canal" maxLength={48} onChange={(event) => setRenameName(event.target.value)} placeholder={`Renomear ${selectedChannel.name}`} value={renameName} /><button disabled={!renameName.trim()} type="submit">Salvar nome</button></form><button className="channel-home__archive" onClick={() => void archiveSelected()} type="button">Arquivar canal</button></div>
        </details>}
      </div> : <div className="channel-home__empty">
        <span><BrandMark /></span><p className="eyebrow">SUA BASE DE CONVERSAS</p><h1>{canCreateChannel ? 'Crie o primeiro canal.' : 'Ainda não há canais.'}</h1><p>{canCreateChannel ? 'Use o botão + ao lado do seu perfil para começar.' : 'Quando um host criar um canal, ele aparecerá automaticamente aqui.'}</p>{canCreateChannel && <button onClick={() => setCreating(true)} type="button">Criar canal <span>+</span></button>}
      </div>}
    </section>
  </main>
}
