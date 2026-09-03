import { useEffect, useMemo, useState } from 'react'
import {
  AdminApiError,
  createInvitation,
  createInviteCode,
  listAdminInvitations,
  listAdminRooms,
  listAdminUsers,
  listInviteCodes,
  getAdminUsageSummary,
  getCallGuardrailSettings,
  revokeInvitation,
  revokeInviteCode,
  roomAction,
  setUserRole,
  setUserStatus,
  updateCallGuardrailSettings,
  subscribeToAdminChanges,
  type AdminInvitation,
  type AdminInviteCode,
  type AdminRoom,
  type AdminUser,
  type AdminUsageSummary,
  type CallGuardrailSettings,
} from '../services/admin'
import type { AccountProfile } from '../types'
import { BrandMark } from '../components/ui/BrandMark'
import { Icon } from '../components/ui/Icon'

type AdminTab = 'rooms' | 'users' | 'invitations' | 'settings'

const defaultGuardrails: CallGuardrailSettings = {
  soloWarningSeconds: 240,
  soloKickSeconds: 300,
  maxCallSeconds: 21600,
  maxWarningSeconds: 300,
  cooldownSeconds: 900,
  maxScreenShareDimension: 1280,
  activeCallLimit: 5,
  startingTimeoutSeconds: 120,
}

interface AdminPanelProps {
  currentUser: AccountProfile
  onClose: () => void
  onLogout: () => Promise<void>
}

const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'
const formatDuration = (startedAt?: string, endedAt?: string) => {
  if (!startedAt) return '—'
  const end = endedAt ? new Date(endedAt).getTime() : Date.now()
  const seconds = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000))
  return `${Math.floor(seconds / 60)}min ${String(seconds % 60).padStart(2, '0')}s`
}

const statusLabel = (status: string) => ({ active: 'Ativo', disabled: 'Desativado', pending: 'Pendente', accepted: 'Aceito', revoked: 'Revogado', expired: 'Expirado', used: 'Usado', open: 'Aberta', starting: 'Iniciando', closed: 'Encerrada', owner: 'Proprietário', manager: 'Gerente', host: 'Host', member: 'Membro' }[status] || status)

export const AdminPanel = ({ currentUser, onClose, onLogout }: AdminPanelProps) => {
  const [tab, setTab] = useState<AdminTab>('rooms')
  const [rooms, setRooms] = useState<AdminRoom[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [invitations, setInvitations] = useState<AdminInvitation[]>([])
  const [inviteCodes, setInviteCodes] = useState<AdminInviteCode[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<'manager' | 'host' | 'member'>('member')
  const [codeRole, setCodeRole] = useState<'manager' | 'host' | 'member'>('member')
  const [codeLabel, setCodeLabel] = useState('')
  const [notice, setNotice] = useState('')
  const [usage, setUsage] = useState<AdminUsageSummary | null>(null)
  const [guardrails, setGuardrails] = useState<CallGuardrailSettings>(defaultGuardrails)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [nextRooms, nextUsers, nextInvitations, nextInviteCodes, nextUsage, nextGuardrails] = await Promise.all([listAdminRooms(), listAdminUsers(), listAdminInvitations(), listInviteCodes(), getAdminUsageSummary(), currentUser.role === 'owner' ? getCallGuardrailSettings() : Promise.resolve(null)])
      setRooms(nextRooms)
      setUsers(nextUsers)
      setInvitations(nextInvitations)
      setInviteCodes(nextInviteCodes)
      setUsage(nextUsage)
      if (nextGuardrails) setGuardrails(nextGuardrails)
    } catch (loadError) {
      setError(loadError instanceof AdminApiError && loadError.status === 403 ? 'Acesso administrativo negado.' : 'Não foi possível carregar o painel.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    return subscribeToAdminChanges(() => {
      window.setTimeout(() => void load(), 300)
    })
  }, [])

  const openRooms = useMemo(() => rooms.filter((room) => room.status !== 'closed'), [rooms])

  const updateUser = async (user: AdminUser) => {
    if (user.userId === currentUser.userId || !window.confirm(`${user.status === 'active' ? 'Desativar' : 'Reativar'} ${user.email}?`)) return
    const nextStatus = user.status === 'active' ? 'disabled' : 'active'
    setBusy(user.userId)
    setError('')
    try {
      const result = await setUserStatus(user.userId, nextStatus)
      if (!result.ok) setError('Conta atualizada, mas a revogação de todas as sessões precisa ser reconciliada.')
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível atualizar a conta.')
    } finally {
      setBusy('')
    }
  }

  const updateUserRole = async (user: AdminUser, role: 'manager' | 'host' | 'member') => {
    if (currentUser.role !== 'owner' || user.userId === currentUser.userId || user.role === 'owner' || user.role === role) return
    if (!window.confirm(`Alterar ${user.email} de ${statusLabel(user.role)} para ${statusLabel(role)}?`)) { setUsers((current) => [...current]); return }
    setBusy(`role:${user.userId}`)
    setError('')
    setNotice('')
    try {
      await setUserRole(user.userId, role)
      setNotice(`${user.displayName || user.email} agora é ${statusLabel(role)}.`)
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível alterar o perfil do usuário.')
    } finally {
      setBusy('')
    }
  }

  const submitInvitation = async () => {
    if (!email.trim()) return
    setBusy('invite')
    setError('')
    setNotice('')
    try {
      await createInvitation(email, inviteRole)
      setEmail('')
      setNotice('Convite enviado. O link expira em sete dias.')
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível enviar o convite.')
    } finally {
      setBusy('')
    }
  }

  const submitInviteCode = async () => {
    setBusy('code')
    setError('')
    setNotice('')
    try {
      const created = await createInviteCode(codeRole, codeLabel)
      setCodeLabel('')
      setNotice(`Código gerado: ${created.code}`)
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível gerar o código.')
    } finally {
      setBusy('')
    }
  }

  const revokeCode = async (code: AdminInviteCode) => {
    if (!window.confirm(`Revogar o código ${code.code}?`)) return
    setBusy(code.id)
    try {
      await revokeInviteCode(code.id)
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível revogar o código.')
    } finally {
      setBusy('')
    }
  }

  const copyCode = (code: string) => {
    void navigator.clipboard.writeText(code).then(() => {
      setNotice(`Código ${code} copiado.`)
    })
  }

  const revoke = async (invitation: AdminInvitation) => {
    if (!window.confirm(`Revogar o convite para ${invitation.email}?`)) return
    setBusy(invitation.id)
    try {
      await revokeInvitation(invitation.id)
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível revogar o convite.')
    } finally {
      setBusy('')
    }
  }

  const endRoom = async (room: AdminRoom) => {
    if (!window.confirm(`Encerrar a sala ${room.roomName}?`)) return
    setBusy(room.id)
    try {
      await roomAction('end_room', room.id)
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível encerrar a sala.')
    } finally {
      setBusy('')
    }
  }

  const removeParticipant = async (room: AdminRoom, participantId: string, name: string) => {
    if (!window.confirm(`Remover ${name} da sala ${room.roomName}?`)) return
    setBusy(participantId)
    try {
      await roomAction('remove_participant', room.id, participantId)
      await load()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível remover o participante.')
    } finally {
      setBusy('')
    }
  }

  const saveGuardrails = async () => {
    if (guardrails.soloKickSeconds <= guardrails.soloWarningSeconds || guardrails.maxWarningSeconds >= guardrails.maxCallSeconds) {
      setError('O kick precisa ocorrer depois do aviso, e o aviso de duração antes do fim da call.')
      return
    }
    setBusy('settings')
    setError('')
    setNotice('')
    try {
      const saved = await updateCallGuardrailSettings(guardrails)
      setGuardrails(saved)
      setNotice('Limites de chamadas atualizados.')
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Não foi possível salvar os limites.')
    } finally {
      setBusy('')
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="brand brand--compact"><BrandMark /><h1>SPLOTYS</h1></div>
        <div className="admin-header__identity"><span>ADMIN</span><strong>{currentUser.displayName || currentUser.email}</strong><button onClick={() => void onLogout()} type="button">Sair</button></div>
      </header>
      <div className="admin-layout">
        <aside className="admin-sidebar">
          <p className="eyebrow">CONTROL PLANE</p>
          <h2>Administração</h2>
          <nav aria-label="Seções administrativas">
            <button className={tab === 'rooms' ? 'is-active' : ''} onClick={() => setTab('rooms')} type="button"><Icon name="users" /> Calls <b>{openRooms.length}</b></button>
            <button className={tab === 'users' ? 'is-active' : ''} onClick={() => setTab('users')} type="button"><Icon name="users" /> Usuários <b>{users.length}</b></button>
            <button className={tab === 'invitations' ? 'is-active' : ''} onClick={() => setTab('invitations')} type="button"><Icon name="send" /> Convites <b>{invitations.filter((item) => item.status === 'pending').length}</b></button>
            {currentUser.role === 'owner' && <button className={tab === 'settings' ? 'is-active' : ''} onClick={() => setTab('settings')} type="button"><Icon name="settings" /> Limites</button>}
          </nav>
          <button className="admin-back" onClick={onClose} type="button"><Icon name="chevron" /> Voltar ao lobby</button>
        </aside>
        <section className="admin-content">
          <header className="admin-content__heading"><div><p className="eyebrow">VISÃO GERAL</p><h2>{tab === 'rooms' ? 'Calls abertas' : tab === 'users' ? 'Usuários' : tab === 'invitations' ? 'Convites' : 'Limites de chamadas'}</h2>{usage && <small>Consumo estimado: {usage.estimatedMinutes.toLocaleString('pt-BR')} / {usage.budget.toLocaleString('pt-BR')} min ({usage.percentage ?? 0}%)</small>}</div><button className="admin-refresh" disabled={loading} onClick={() => void load()} type="button">{loading ? 'Atualizando…' : 'Atualizar'}</button></header>
          {error && <div className="inline-error" role="alert"><Icon name="warning" /><span>{error}</span></div>}
          {notice && <div className="admin-notice" role="status">{notice}</div>}
          {loading && !rooms.length && !users.length && !invitations.length ? <div className="admin-empty"><span className="spinner" /> Carregando dados protegidos…</div> : (
            <>
              {tab === 'rooms' && <RoomsTable rooms={rooms} busy={busy} onEnd={endRoom} onRemove={removeParticipant} />}
              {tab === 'users' && <UsersTable canChangeRoles={currentUser.role === 'owner'} currentUserId={currentUser.userId} users={users} busy={busy} onRoleChange={updateUserRole} onToggle={updateUser} />}
              {tab === 'invitations' && <>
                <InviteCodesSection codeLabel={codeLabel} codeRole={codeRole} canInviteManagers={currentUser.role === 'owner'} busy={busy} codes={inviteCodes} onRoleChange={setCodeRole} onLabelChange={setCodeLabel} onCreate={() => void submitInviteCode()} onRevoke={revokeCode} onCopy={copyCode} />
                <InvitationsTable email={email} inviteRole={inviteRole} canInviteManagers={currentUser.role === 'owner'} busy={busy} invitations={invitations} onRoleChange={setInviteRole} onEmailChange={setEmail} onInvite={() => void submitInvitation()} onRevoke={revoke} />
              </>}
              {tab === 'settings' && currentUser.role === 'owner' && <GuardrailsForm settings={guardrails} busy={busy === 'settings'} onChange={setGuardrails} onSave={() => void saveGuardrails()} />}
            </>
          )}
        </section>
      </div>
    </main>
  )
}

const RoomsTable = ({ rooms, busy, onEnd, onRemove }: { rooms: AdminRoom[]; busy: string; onEnd: (room: AdminRoom) => Promise<void>; onRemove: (room: AdminRoom, id: string, name: string) => Promise<void> }) => (
  <div className="admin-room-grid">
    {!rooms.length && <div className="admin-empty">Nenhuma call registrada ainda.</div>}
    {rooms.map((room) => <article className="admin-room-card" key={room.id}>
      <header><div><span className={`admin-status admin-status--${room.status}`} /> <strong>{room.roomName}</strong><small>{statusLabel(room.status)}</small></div>{room.status !== 'closed' && <button disabled={busy === room.id} onClick={() => void onEnd(room)} type="button">Encerrar</button>}</header>
      <div className="admin-room-meta"><span>Início <b>{formatDate(room.startedAt || room.createdAt)}</b></span><span>Duração <b>{formatDuration(room.startedAt, room.endedAt)}</b></span><span>Participantes <b>{room.participants.filter((item) => !item.leftAt).length}</b></span></div>
      <div className="admin-participants">{room.participants.length ? room.participants.map((participant) => <div key={participant.id}><span>{participant.name}</span><small>{participant.identity}</small>{!participant.leftAt && room.status !== 'closed' && <button disabled={busy === participant.id} onClick={() => void onRemove(room, participant.id, participant.name)} type="button">Remover</button>}</div>) : <p>Nenhum participante recebido.</p>}</div>
    </article>)}
  </div>
)

const GuardrailsForm = ({ settings, busy, onChange, onSave }: { settings: CallGuardrailSettings; busy: boolean; onChange: (next: CallGuardrailSettings) => void; onSave: () => void }) => {
  const update = (key: keyof CallGuardrailSettings, value: string) => onChange({ ...settings, [key]: Math.max(0, Number(value) || 0) })
  const fields: Array<[keyof CallGuardrailSettings, string, string]> = [
    ['soloWarningSeconds', 'Aviso de usuário sozinho (segundos)', '30'],
    ['soloKickSeconds', 'Kick de usuário sozinho (segundos)', '60'],
    ['maxCallSeconds', 'Duração máxima da call (segundos)', '300'],
    ['maxWarningSeconds', 'Aviso antes do fim (segundos)', '30'],
    ['cooldownSeconds', 'Cooldown após encerramento (segundos)', '0'],
    ['startingTimeoutSeconds', 'Timeout para call sem iniciar (segundos)', '30'],
    ['activeCallLimit', 'Máximo de calls simultâneas', '1'],
    ['maxScreenShareDimension', 'Maior dimensão de compartilhamento (px)', '360'],
  ]
  return <div className="admin-settings"><p className="admin-settings__hint">Somente o proprietário pode alterar estes limites. Eles são aplicados pelo worker de controle a cada minuto.</p><div className="admin-settings__grid">{fields.map(([key, label, min]) => <label key={key}>{label}<input min={min} onChange={(event) => update(key, event.target.value)} step="1" type="number" value={settings[key] as number} /></label>)}</div><button className="primary-button" disabled={busy} onClick={onSave} type="button">{busy ? 'Salvando…' : 'Salvar limites'}</button></div>
}

const UsersTable = ({ users, currentUserId, canChangeRoles, busy, onToggle, onRoleChange }: { users: AdminUser[]; currentUserId: string; canChangeRoles: boolean; busy: string; onToggle: (user: AdminUser) => Promise<void>; onRoleChange: (user: AdminUser, role: 'manager' | 'host' | 'member') => Promise<void> }) => (
  <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Usuário</th><th>Perfil de acesso</th><th>Estado</th><th>Criado</th><th>Último acesso</th><th /></tr></thead><tbody>{users.map((user) => { const roleBusy = busy === `role:${user.userId}`; const roleEditable = canChangeRoles && user.userId !== currentUserId && user.role !== 'owner'; return <tr key={user.userId}><td><strong>{user.displayName || 'Sem nome'}</strong><small>{user.email}</small>{user.userId === currentUserId && <em>você</em>}</td><td>{roleEditable ? <select aria-label={`Perfil de acesso de ${user.displayName || user.email}`} className="admin-role-select" disabled={roleBusy} onChange={(event) => void onRoleChange(user, event.target.value as 'manager' | 'host' | 'member')} value={user.role}><option value="manager">Gerente</option><option value="host">Host</option><option value="member">Membro</option></select> : <span className="admin-role-label">{statusLabel(user.role)}</span>}</td><td><span className={`admin-status admin-status--${user.status}`} />{statusLabel(user.status)}</td><td>{formatDate(user.createdAt)}</td><td>{formatDate(user.lastSignInAt)}</td><td><button disabled={user.userId === currentUserId || busy === user.userId || roleBusy} onClick={() => void onToggle(user)} type="button">{user.status === 'active' ? 'Desativar' : 'Reativar'}</button></td></tr> })}</tbody></table>{!users.length && <div className="admin-empty">Nenhum usuário encontrado.</div>}</div>
)

const InviteCodesSection = ({ codes, codeLabel, codeRole, canInviteManagers, busy, onRoleChange, onLabelChange, onCreate, onRevoke, onCopy }: { codes: AdminInviteCode[]; codeLabel: string; codeRole: 'manager' | 'host' | 'member'; canInviteManagers: boolean; busy: string; onRoleChange: (value: 'manager' | 'host' | 'member') => void; onLabelChange: (value: string) => void; onCreate: () => void; onRevoke: (code: AdminInviteCode) => Promise<void>; onCopy: (code: string) => void }) => (
  <div className="admin-invites">
    <p className="eyebrow">CÓDIGOS DE CONVITE</p>
    <div className="admin-invite-form">
      <input aria-label="Rótulo opcional" onChange={(event) => onLabelChange(event.target.value)} placeholder="Rótulo (opcional)" type="text" value={codeLabel} />
      <select aria-label="Tipo de usuário" onChange={(event) => onRoleChange(event.target.value as 'manager' | 'host' | 'member')} value={codeRole}>
        {canInviteManagers && <option value="manager">Gerente</option>}
        <option value="host">Host</option>
        <option value="member">Membro</option>
      </select>
      <button className="primary-button" disabled={busy === 'code'} onClick={onCreate} type="button">Gerar código <Icon name="chevron" /></button>
    </div>
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead><tr><th>Código</th><th>Rótulo</th><th>Tipo</th><th>Estado</th><th>Criado</th><th>Expira</th><th /></tr></thead>
        <tbody>{codes.map((code) => (
          <tr key={code.id}>
            <td><strong style={{ fontFamily: 'var(--font-mono, monospace)', letterSpacing: '0.08em' }}>{code.code}</strong></td>
            <td>{code.label || '—'}</td>
            <td>{statusLabel(code.role)}</td>
            <td><span className={`admin-status admin-status--${code.status}`} />{statusLabel(code.status)}</td>
            <td>{formatDate(code.createdAt)}</td>
            <td>{formatDate(code.expiresAt)}</td>
            <td>
              {code.status === 'active' && <>
                <button disabled={busy === code.id} onClick={() => onCopy(code.code)} type="button">Copiar</button>
                <button disabled={busy === code.id} onClick={() => void onRevoke(code)} type="button">Revogar</button>
              </>}
            </td>
          </tr>
        ))}</tbody>
      </table>
      {!codes.length && <div className="admin-empty">Nenhum código gerado.</div>}
    </div>
  </div>
)

const InvitationsTable = ({ invitations, email, inviteRole, canInviteManagers, busy, onRoleChange, onEmailChange, onInvite, onRevoke }: { invitations: AdminInvitation[]; email: string; inviteRole: 'manager' | 'host' | 'member'; canInviteManagers: boolean; busy: string; onRoleChange: (value: 'manager' | 'host' | 'member') => void; onEmailChange: (value: string) => void; onInvite: () => void; onRevoke: (invitation: AdminInvitation) => Promise<void> }) => (
  <div className="admin-invites">
    <p className="eyebrow">CONVITES POR E-MAIL</p>
    <div className="admin-invite-form"><input aria-label="E-mail do convidado" onChange={(event) => onEmailChange(event.target.value)} placeholder="convidado@exemplo.com" type="email" value={email} /><select aria-label="Tipo de usuário" onChange={(event) => onRoleChange(event.target.value as 'manager' | 'host' | 'member')} value={inviteRole}>{canInviteManagers && <option value="manager">Gerente</option>}<option value="host">Host</option><option value="member">Membro</option></select><button className="primary-button" disabled={!email.trim() || busy === 'invite'} onClick={onInvite} type="button">Enviar convite <Icon name="send" /></button></div>
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>E-mail</th><th>Tipo</th><th>Estado</th><th>Criado</th><th>Expira</th><th /></tr></thead><tbody>{invitations.map((invitation) => <tr key={invitation.id}><td><strong>{invitation.email}</strong></td><td>{invitation.role}</td><td><span className={`admin-status admin-status--${invitation.status}`} />{statusLabel(invitation.status)}</td><td>{formatDate(invitation.createdAt)}</td><td>{formatDate(invitation.expiresAt)}</td><td>{invitation.status === 'pending' && <button disabled={busy === invitation.id} onClick={() => void onRevoke(invitation)} type="button">Revogar</button>}</td></tr>)}</tbody></table>{!invitations.length && <div className="admin-empty">Nenhum convite emitido.</div>}</div>
  </div>
)
