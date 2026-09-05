import { useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react'
import { MAX_DIRECT_MESSAGE_IMAGE_SIZE, deleteDirectMessage, listDirectMessages, markDirectConversationRead, resolveDirectMessageImage, searchSocialUser, sendDirectImage, sendDirectText, socialAction, submitContentReport, type ContentReportReason } from '../../services/social'
import type { AccountProfile, DirectMessage, FriendProfile, SocialOverview } from '../../types'
import { Icon } from '../ui/Icon'
import { ProfileAvatar } from '../ui/ProfileAvatar'
import { StyledProfileName } from '../ui/StyledProfileName'

type Tab = 'all' | 'online' | 'pending' | 'blocked' | 'add'

interface Props {
  profile: AccountProfile
  overview: SocialOverview
  onRefresh: () => Promise<void>
  initialConversationId?: string
}

const clock = (value?: string) => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''
const dateLabel = (value: string) => {
  const date = new Date(value); const today = new Date(); const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Hoje'
  if (date.toDateString() === yesterday.toDateString()) return 'Ontem'
  return date.toLocaleDateString([], { day: '2-digit', month: 'short' })
}

const friendlyError = (error: unknown) => {
  if (error instanceof Error && /USERNAME_INVALID/.test(error.message)) return 'Informe um @username válido.'
  if (error instanceof Error && /IMAGE_TOO_LARGE/.test(error.message)) return 'A imagem pode ter no máximo 4 MB.'
  if (error instanceof Error && /IMAGE_TYPE_INVALID/.test(error.message)) return 'Use JPG, PNG, WEBP ou GIF.'
  if (error instanceof Error && /SOCIAL_ACTION_UNAVAILABLE|SOCIAL_TARGET_NOT_FOUND/.test(error.message)) return 'Essa ação não está disponível.'
  return 'Não foi possível concluir essa operação agora.'
}

const FriendIdentity = ({ friend, subtitle }: { friend: FriendProfile; subtitle?: string }) => <><ProfileAvatar avatarDataUrl={friend.avatarDataUrl} name={friend.displayName} /><span><StyledProfileName style={friend.nameStyle}>{friend.displayName}</StyledProfileName><small>{subtitle || `@${friend.username}`}</small></span></>

export const FriendsWorkspace = ({ profile, overview, onRefresh, initialConversationId }: Props) => {
  const [tab, setTab] = useState<Tab>('all')
  const [selectedId, setSelectedId] = useState('')
  const [search, setSearch] = useState('')
  const [searchResult, setSearchResult] = useState<{ profile: FriendProfile | null; relationship: string | null } | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [confirm, setConfirm] = useState<{ action: 'remove_friend' | 'block_user'; friend: FriendProfile } | null>(null)
  const [reporting, setReporting] = useState<FriendProfile | null>(null)
  const [reportReason, setReportReason] = useState<ContentReportReason>('harassment')
  const [reportDetails, setReportDetails] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const conversation = useMemo(() => overview.conversations.find((item) => item.id === selectedId) || overview.conversations[0], [overview.conversations, selectedId])
  const friend = conversation?.friend
  const isReadOnly = conversation?.friendshipStatus === 'removed'

  useEffect(() => { if (conversation && conversation.id !== selectedId) setSelectedId(conversation.id) }, [conversation, selectedId])
  useEffect(() => {
    if (!initialConversationId || !overview.conversations.some((item) => item.id === initialConversationId)) return
    setTab('all')
    setSelectedId(initialConversationId)
  }, [initialConversationId, overview.conversations])
  useEffect(() => {
    const hasSocialActivity = overview.conversations.length || overview.friends.length || overview.incoming.length || overview.outgoing.length || overview.blocked.length
    if (tab !== 'add' && !hasSocialActivity) setTab('add')
  }, [overview.blocked.length, overview.conversations.length, overview.friends.length, overview.incoming.length, overview.outgoing.length, tab])

  useEffect(() => {
    let active = true
    const load = async () => {
      if (!conversation) { setMessages([]); return }
      setLoadingMessages(true)
      try {
        const next = await listDirectMessages(conversation.id)
        const hydrated = await Promise.all(next.map((message) => resolveDirectMessageImage(message).catch(() => message)))
        if (!active) return
        setMessages(hydrated)
        const last = hydrated.at(-1)
        if (last && typeof last.id === 'number') void markDirectConversationRead(conversation.id, last.id).catch(() => undefined)
      } catch { if (active) setError('Não foi possível carregar as mensagens.') } finally { if (active) setLoadingMessages(false) }
    }
    void load()
    return () => { active = false }
  }, [conversation?.id])

  const refresh = async () => { try { await onRefresh(); setError('') } catch { setError('Não foi possível atualizar seus amigos.') } }
  const act = async (action: Parameters<typeof socialAction>[0], targetUserId: string, successMessage?: string) => {
    try {
      setError('')
      await socialAction(action, targetUserId)
      await refresh()
      if (action === 'block_user') setSelectedId('')
      if (successMessage) setNotice(successMessage)
      return true
    } catch (actionError) {
      setError(friendlyError(actionError))
      return false
    }
  }
  const sendFriendRequest = async (friend: FriendProfile) => {
    const sent = await act('send_request', friend.userId, `Pedido enviado para @${friend.username}.`)
    if (sent) setSearchResult((current) => current?.profile?.userId === friend.userId ? { ...current, relationship: 'outgoing' } : current)
  }
  const searchUser = async (event: FormEvent) => { event.preventDefault(); try { setError(''); setSearchResult(await searchSocialUser(search)) } catch (searchError) { setSearchResult(null); setError(friendlyError(searchError)) } }

  const sendText = async (value: string) => {
    if (!conversation || !friend || isReadOnly) return false
    try {
      const sent = await sendDirectText(conversation.id, friend.userId, value)
      setMessages((current) => [...current, sent])
      await refresh()
      return true
    } catch (sendError) { setError(friendlyError(sendError)); return false }
  }
  const sendImage = async (file: File) => {
    if (!conversation || !friend || isReadOnly) return false
    try {
      const sent = await sendDirectImage(conversation.id, friend.userId, file)
      const hydrated = await resolveDirectMessageImage(sent).catch(() => sent)
      setMessages((current) => [...current, hydrated])
      await refresh()
      return true
    } catch (sendError) { setError(friendlyError(sendError)); return false }
  }
  const removeMessage = async (message: DirectMessage) => {
    try { await deleteDirectMessage(message); setMessages((current) => current.map((item) => item.id === message.id ? { ...item, deletedAt: new Date().toISOString(), imageUrl: undefined, text: undefined } : item)); await refresh() } catch (deleteError) { setError(friendlyError(deleteError)) }
  }
  const submitReport = async () => {
    if (!reporting) return
    try {
      setError('')
      await submitContentReport(reporting.userId, reportReason, reportDetails)
      setReporting(null)
      setReportDetails('')
    } catch (reportError) {
      setError(friendlyError(reportError))
    }
  }

  const visibleFriends = tab === 'online' ? overview.friends.filter((item) => item.online) : overview.friends

  return <section className="social-workspace">
    <aside className="social-panel">
      <header className="social-panel__header"><div><p className="eyebrow">CONEXÕES</p><h1>Amigos</h1></div><button aria-label="Adicionar amigo" className="social-panel__add" onClick={() => setTab('add')} type="button">+</button></header>
      <nav className="social-tabs" aria-label="Seções de amigos"><button className={tab === 'all' ? 'is-active' : ''} onClick={() => setTab('all')} type="button">Todos <b>{overview.friends.length}</b></button><button className={tab === 'online' ? 'is-active' : ''} onClick={() => setTab('online')} type="button">Online <b>{overview.friends.filter((item) => item.online).length}</b></button><button className={tab === 'pending' ? 'is-active' : ''} onClick={() => setTab('pending')} type="button">Pendentes {(overview.incoming.length + overview.outgoing.length) > 0 && <b>{overview.incoming.length + overview.outgoing.length}</b>}</button></nav>
      <div className="social-panel__list">
        {(tab === 'all' || tab === 'online') && visibleFriends.map((item) => {
          const itemConversation = overview.conversations.find((value) => value.friend.userId === item.userId)
          return <button className={`social-friend-row${itemConversation?.id === conversation?.id ? ' is-active' : ''}`} key={item.userId} onClick={() => { if (itemConversation) { setSelectedId(itemConversation.id); setTab('all') } }} type="button"><span className={`social-friend-row__avatar${item.online ? ' is-online' : ''}`}><ProfileAvatar avatarDataUrl={item.avatarDataUrl} name={item.displayName} /></span><span><StyledProfileName style={item.nameStyle}>{item.displayName}</StyledProfileName><small>{item.activity ? `${item.activity.kind === 'game' ? 'Jogando' : 'Usando'} ${item.activity.displayName}` : `@${item.username}`}</small></span>{itemConversation?.unreadCount ? <b className="social-count">{itemConversation.unreadCount > 99 ? '99+' : itemConversation.unreadCount}</b> : null}</button>
        })}
        {tab === 'pending' && <>
          {overview.incoming.map((item) => <article className="social-request" key={item.userId}><FriendIdentity friend={item} subtitle="quer ser seu amigo" /><div><button className="is-primary" onClick={() => void act('accept_request', item.userId)} type="button">Aceitar</button><button onClick={() => void act('decline_request', item.userId)} type="button">Recusar</button></div></article>)}
          {overview.outgoing.map((item) => <article className="social-request" key={item.userId}><FriendIdentity friend={item} subtitle="pedido enviado" /><div><button onClick={() => void act('cancel_request', item.userId)} type="button">Cancelar</button></div></article>)}
          {!overview.incoming.length && !overview.outgoing.length && <div className="social-list-empty"><Icon name="users" /><strong>Nenhum pedido pendente.</strong></div>}
        </>}
        {tab === 'blocked' && overview.blocked.map((item) => <article className="social-request" key={item.userId}><FriendIdentity friend={item} subtitle="bloqueado" /><div><button onClick={() => void act('unblock_user', item.userId)} type="button">Desbloquear</button></div></article>)}
        {(tab === 'all' || tab === 'online') && !visibleFriends.length && <div className="social-list-empty"><Icon name="users" /><strong>{tab === 'online' ? 'Ninguém online agora.' : 'Seu círculo está vazio.'}</strong><button onClick={() => setTab('add')} type="button">ADICIONAR AMIGO</button></div>}
      </div>
      <button className="social-panel__blocked" onClick={() => setTab('blocked')} type="button">Bloqueados {overview.blocked.length ? <b>{overview.blocked.length}</b> : null}</button>
    </aside>

    <section className="social-main">
      {tab === 'add' ? <div className="social-discovery"><p className="eyebrow">ENCONTRE SUA DUPLA</p><h2>Adicione pelo <em>@username.</em></h2><p>A busca só funciona com o identificador completo.</p><form onSubmit={(event) => void searchUser(event)}><div><b>@</b><input autoCapitalize="none" onChange={(event) => setSearch(event.target.value)} placeholder="username" spellCheck={false} value={search.replace(/^@/, '')} /></div><button className="social-primary" disabled={!search.trim()} type="submit">BUSCAR <Icon name="chevron" /></button></form>
        {searchResult?.profile && <article className="social-search-result"><FriendIdentity friend={searchResult.profile} /><div>{searchResult.relationship === 'self' ? <small>Esse é o seu perfil.</small> : searchResult.relationship === 'friend' ? <small>Vocês já são amigos.</small> : searchResult.relationship === 'outgoing' ? <small>Pedido já enviado.</small> : searchResult.relationship === 'incoming' ? <button className="social-primary" onClick={() => void act('accept_request', searchResult.profile!.userId)} type="button">ACEITAR PEDIDO</button> : <button className="social-primary" onClick={() => void sendFriendRequest(searchResult.profile!)} type="button">ADICIONAR AMIGO</button>}</div></article>}
        {searchResult && !searchResult.profile && <div className="social-search-empty"><Icon name="warning" /><strong>Nenhum perfil encontrado.</strong><span>Confira o @username e tente novamente.</span></div>}
      </div> : conversation && friend ? <DirectConversation key={conversation.id} currentUserId={profile.userId} friend={friend} isReadOnly={isReadOnly} loading={loadingMessages} messages={messages} onDelete={removeMessage} onImage={sendImage} onRemove={() => setConfirm({ action: 'remove_friend', friend })} onReRequest={() => void act('send_request', friend.userId)} onSend={sendText} onBlock={() => setConfirm({ action: 'block_user', friend })} onReport={() => setReporting(friend)} fileRef={fileRef} /> : <div className="social-empty"><span><Icon name="chat" /></span><p className="eyebrow">CONVERSAS PRIVADAS</p><h2>Seu círculo, por perto.</h2><p>Selecione um amigo ou encontre alguém pelo @username.</p><button className="social-primary" onClick={() => setTab('add')} type="button">ADICIONAR AMIGO</button></div>}
      {error && <div className="social-error" role="alert"><Icon name="warning" /><span>{error}</span><button aria-label="Fechar erro" onClick={() => setError('')} type="button"><Icon name="x" /></button></div>}
      {notice && <div className="social-notice" role="status"><Icon name="check" /><span>{notice}</span><button aria-label="Fechar aviso" onClick={() => setNotice('')} type="button"><Icon name="x" /></button></div>}
    </section>
    {confirm && <div className="social-confirm-backdrop" role="presentation"><section aria-modal="true" className="social-confirm" role="dialog"><p className="eyebrow">CONFIRMAR AÇÃO</p><h2>{confirm.action === 'block_user' ? `Bloquear @${confirm.friend.username}?` : 'Remover amizade?'}</h2><p>{confirm.action === 'block_user' ? 'A amizade será removida e a conversa ficará inacessível para ambos.' : 'O histórico continuará disponível, mas novas mensagens ficarão bloqueadas.'}</p><div><button onClick={() => setConfirm(null)} type="button">Cancelar</button><button className="is-danger" onClick={() => { void act(confirm.action, confirm.friend.userId); setConfirm(null) }} type="button">{confirm.action === 'block_user' ? 'BLOQUEAR' : 'REMOVER'}</button></div></section></div>}
    {reporting && <div className="social-confirm-backdrop" role="presentation"><section aria-modal="true" className="social-confirm social-report" role="dialog"><p className="eyebrow">SEGURANÇA DA COMUNIDADE</p><h2>Reportar @{reporting.username}</h2><p>Envie a denúncia para análise. Se houver risco imediato, bloqueie a pessoa também.</p><label>Motivo<select aria-label="Motivo da denúncia" onChange={(event) => setReportReason(event.target.value as ContentReportReason)} value={reportReason}><option value="harassment">Assédio ou bullying</option><option value="hate_or_discrimination">Ódio ou discriminação</option><option value="sexual_content">Conteúdo sexual</option><option value="violence_or_threat">Ameaça ou violência</option><option value="spam_or_scam">Spam ou golpe</option><option value="other">Outro</option></select></label><label>Contexto opcional<textarea aria-label="Contexto da denúncia" maxLength={1000} onChange={(event) => setReportDetails(event.target.value)} placeholder="Conte o que aconteceu" value={reportDetails} /></label><a href="/community-guidelines.html" rel="noreferrer" target="_blank">Ler diretrizes da comunidade</a><div><button onClick={() => setReporting(null)} type="button">Cancelar</button><button className="is-danger" onClick={() => void submitReport()} type="button">ENVIAR DENÚNCIA</button></div></section></div>}
  </section>
}

const DirectConversation = ({ currentUserId, friend, isReadOnly, messages, loading, onSend, onImage, onDelete, onRemove, onReRequest, onBlock, onReport, fileRef }: { currentUserId: string; friend: FriendProfile; isReadOnly: boolean; messages: DirectMessage[]; loading: boolean; onSend: (text: string) => Promise<boolean>; onImage: (file: File) => Promise<boolean>; onDelete: (message: DirectMessage) => void; onRemove: () => void; onReRequest: () => void; onBlock: () => void; onReport: () => void; fileRef: RefObject<HTMLInputElement | null> }) => {
  const [text, setText] = useState(''); const [sending, setSending] = useState(false); const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }) }, [messages])
  const submit = async (event: FormEvent) => { event.preventDefault(); if (!text.trim() || sending) return; setSending(true); if (await onSend(text)) setText(''); setSending(false) }
  let lastDate = ''
  return <div className="dm-conversation"><header className="dm-conversation__header"><div><ProfileAvatar avatarDataUrl={friend.avatarDataUrl} name={friend.displayName} /><span><StyledProfileName style={friend.nameStyle}>{friend.displayName}</StyledProfileName><small>@{friend.username} · conversa privada</small></span></div><details><summary aria-label="Opções da amizade">•••</summary><section><button onClick={onRemove} type="button">Remover amizade</button><button onClick={onReport} type="button">Reportar usuário</button><button className="is-danger" onClick={onBlock} type="button">Bloquear</button></section></details></header>
    <div className="dm-conversation__messages" ref={listRef}>{loading && <div className="dm-loading">Carregando conversa…</div>}{!loading && !messages.length && <div className="social-search-empty"><Icon name="chat" /><strong>A frequência está quieta.</strong><span>Mande a primeira mensagem para @{friend.username}.</span></div>}{messages.map((message) => { const day = dateLabel(message.createdAt); const divider = day !== lastDate; lastDate = day; const local = message.senderId === currentUserId; return <div key={String(message.id)}>{divider && <div className="dm-date"><span>{day}</span></div>}<article className={`dm-message${local ? ' is-local' : ''}`}><header><ProfileAvatar avatarDataUrl={local ? undefined : friend.avatarDataUrl} name={local ? 'Você' : friend.displayName} /><span><strong>{local ? 'Você' : friend.displayName}</strong><time>{clock(message.createdAt)}</time></span>{local && !message.deletedAt && <button aria-label="Apagar mensagem" onClick={() => onDelete(message)} type="button">×</button>}</header>{message.deletedAt ? <p className="is-deleted">Mensagem apagada</p> : message.kind === 'image' && message.imageUrl ? <a href={message.imageUrl} rel="noreferrer" target="_blank"><img alt={message.imageName || 'Imagem enviada'} loading="lazy" src={message.imageUrl} /></a> : <p>{message.text}</p>}</article></div> })}</div>
    {isReadOnly ? <footer className="dm-readonly"><span><strong>Vocês não são mais amigos.</strong><small>Adicione novamente para enviar novas mensagens.</small></span><button onClick={onReRequest} type="button">ENVIAR NOVO PEDIDO</button></footer> : <form className="dm-composer" onSubmit={(event) => void submit(event)}><input accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void onImage(file); event.target.value = '' }} ref={fileRef} type="file" /><button aria-label={`Enviar imagem de até ${MAX_DIRECT_MESSAGE_IMAGE_SIZE / 1024 / 1024} MB`} onClick={() => fileRef.current?.click()} type="button"><Icon name="image" /></button><textarea aria-label="Mensagem privada" maxLength={2000} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form?.requestSubmit() } }} placeholder={`Mensagem para ${friend.displayName}`} value={text} /><button aria-label="Enviar mensagem" disabled={!text.trim() || sending} type="submit"><Icon name="send" /></button></form>}
  </div>
}
