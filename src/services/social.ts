import type { RealtimeChannel } from '@supabase/supabase-js'
import type { DirectMessage, SocialOverview } from '../types'
import { getSupabase } from './supabase'
import { isStoreDemo, storeDemoMessages, storeDemoSocial } from '../dev/store-demo'

const imageBucket = 'direct-message-images'
export const MAX_DIRECT_MESSAGE_IMAGE_SIZE = 4 * 1024 * 1024
const supportedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

type SocialAction = 'send_request' | 'accept_request' | 'decline_request' | 'cancel_request' | 'remove_friend' | 'block_user' | 'unblock_user'
export type ContentReportReason = 'harassment' | 'hate_or_discrimination' | 'sexual_content' | 'violence_or_threat' | 'spam_or_scam' | 'other'
type RawMessage = {
  id: number
  conversation_id: string
  sender_id: string
  recipient_id: string
  kind: 'text' | 'image' | 'channel_invite'
  text_content: string | null
  storage_path: string | null
  image_name: string | null
  image_mime: string | null
  image_size: number | null
  invite_channel_id: string | null
  invite_status: 'pending' | 'accepted' | 'declined' | 'revoked' | null
  created_at: string
  deleted_at: string | null
}

const invoke = async <T>(body: Record<string, unknown>) => {
  const { data, error } = await getSupabase().functions.invoke('social-action', { body })
  if (error) {
    let message = error.message
    try {
      const context = (error as { context?: Response }).context
      if (context && typeof context.json === 'function') {
        const parsed = await context.json()
        if (parsed?.error) message = String(parsed.error)
      }
    } catch { /* fall back to the generic Functions error message */ }
    throw new Error(message)
  }
  return data as T
}

const messageFromRaw = (message: RawMessage): DirectMessage => ({
  id: message.id,
  conversationId: message.conversation_id,
  senderId: message.sender_id,
  recipientId: message.recipient_id,
  kind: message.kind,
  text: message.text_content || undefined,
  imageName: message.image_name || undefined,
  imageMime: message.image_mime || undefined,
  imageSize: message.image_size || undefined,
  storagePath: message.storage_path || undefined,
  inviteChannelId: message.invite_channel_id || undefined,
  inviteStatus: message.invite_status || undefined,
  createdAt: message.created_at,
  deletedAt: message.deleted_at || undefined,
})

export const listSocial = () => isStoreDemo() ? Promise.resolve(storeDemoSocial) : invoke<SocialOverview>({ action: 'list_social' })
export const searchSocialUser = (username: string) => invoke<{ profile: SocialOverview['friends'][number] | null; relationship: 'self' | 'friend' | 'outgoing' | 'incoming' | 'none' | null }>({ action: 'search_user', username })
export const socialAction = (action: SocialAction, targetUserId: string) => invoke<{ ok: true }>({ action, targetUserId })
export const submitContentReport = (targetUserId: string, reason: ContentReportReason, details: string) => invoke<{ ok: true }>({ action: 'report_user', targetUserId, reason, details })

export const listDirectMessages = async (conversationId: string, beforeId?: number) => {
  if (isStoreDemo()) return storeDemoMessages.filter((message) => message.conversationId === conversationId)
  let query = getSupabase().from('direct_messages').select('*').eq('conversation_id', conversationId).order('id', { ascending: false }).limit(50)
  if (beforeId) query = query.lt('id', beforeId)
  const { data, error } = await query
  if (error) throw error
  return (data as RawMessage[]).reverse().map(messageFromRaw)
}

const imageUrl = async (path: string) => {
  const { data, error } = await getSupabase().storage.from(imageBucket).download(path)
  if (error) throw error
  return URL.createObjectURL(data)
}

export const resolveDirectMessageImage = async (message: DirectMessage) => {
  if (!message.storagePath || message.deletedAt) return message
  return { ...message, imageUrl: await imageUrl(message.storagePath) }
}

// Direct-message writes flow through the social Edge Function so the friendship
// and block checks run server-side with the service role, instead of relying on
// row-level policies from the browser client.
export const sendDirectText = async (conversationId: string, _recipientId: string, value: string) => {
  const text = value.trim().slice(0, 2000)
  if (!text) throw new Error('MESSAGE_EMPTY')
  const { message } = await invoke<{ message: RawMessage }>({ action: 'send_message', conversationId, kind: 'text', text })
  return messageFromRaw(message)
}

export const sendDirectImage = async (conversationId: string, _recipientId: string, file: File) => {
  if (!supportedImageTypes.has(file.type)) throw new Error('IMAGE_TYPE_INVALID')
  if (file.size > MAX_DIRECT_MESSAGE_IMAGE_SIZE) throw new Error('IMAGE_TOO_LARGE')
  const { data: auth } = await getSupabase().auth.getUser()
  if (!auth.user) throw new Error('AUTH_REQUIRED')
  const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'image'
  const path = `${conversationId}/${auth.user.id}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await getSupabase().storage.from(imageBucket).upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false })
  if (uploadError) throw uploadError
  try {
    const { message } = await invoke<{ message: RawMessage }>({
      action: 'send_message', conversationId, kind: 'image',
      storagePath: path, imageName: file.name.slice(0, 160), imageMime: file.type, imageSize: file.size,
    })
    return messageFromRaw(message)
  } catch (error) {
    await getSupabase().storage.from(imageBucket).remove([path])
    throw error
  }
}

export const inviteFriendToChannel = async (conversationId: string, channelId: string) => {
  const { message } = await invoke<{ message: RawMessage }>({ action: 'invite_to_channel', conversationId, channelId })
  return messageFromRaw(message)
}

export const respondChannelInvite = (messageId: number | string, accept: boolean) =>
  invoke<{ ok: true; channelId: string | null; status: string | null }>({ action: 'respond_channel_invite', messageId, accept })

export const deleteDirectMessage = async (message: DirectMessage) => {
  const { error } = await getSupabase().from('direct_messages').update({ deleted_at: new Date().toISOString() }).eq('id', message.id)
  if (error) throw error
  if (message.storagePath) await getSupabase().storage.from(imageBucket).remove([message.storagePath])
}

export const markDirectConversationRead = async (conversationId: string, throughMessageId: number) => {
  if (isStoreDemo()) return
  const { data: auth } = await getSupabase().auth.getUser()
  if (!auth.user) return
  const { error } = await getSupabase().from('direct_conversation_state').update({ last_read_message_id: throughMessageId }).eq('conversation_id', conversationId).eq('user_id', auth.user.id)
  if (error) throw error
}

export const subscribeToSocial = (userId: string, onChange: () => void, onIncomingMessage?: (message: DirectMessage) => void) => {
  const client = getSupabase()
  const incomingMessage = (payload: { new: unknown; eventType?: string }) => {
    onChange()
    if (payload.eventType === 'INSERT' && payload.new && typeof payload.new === 'object') onIncomingMessage?.(messageFromRaw(payload.new as RawMessage))
  }
  const channels: RealtimeChannel[] = [
    client.channel(`social-friendships-low-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `user_low_id=eq.${userId}` }, onChange).subscribe(),
    client.channel(`social-friendships-high-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'friendships', filter: `user_high_id=eq.${userId}` }, onChange).subscribe(),
    client.channel(`social-messages-recipient-${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'direct_messages', filter: `recipient_id=eq.${userId}` }, incomingMessage).subscribe(),
    client.channel(`social-messages-sender-${userId}`).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'direct_messages', filter: `sender_id=eq.${userId}` }, onChange).subscribe(),
  ]
  return () => { for (const channel of channels) void client.removeChannel(channel) }
}
