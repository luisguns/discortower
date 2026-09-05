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
  kind: 'text' | 'image'
  text_content: string | null
  storage_path: string | null
  image_name: string | null
  image_mime: string | null
  image_size: number | null
  created_at: string
  deleted_at: string | null
}

const invoke = async <T>(body: Record<string, unknown>) => {
  const { data, error } = await getSupabase().functions.invoke('social-action', { body })
  if (error) throw error
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

const insertMessage = async (values: Record<string, unknown>) => {
  const { data, error } = await getSupabase().from('direct_messages').insert(values).select('*').single()
  if (error) throw error
  return messageFromRaw(data as RawMessage)
}

export const sendDirectText = async (conversationId: string, recipientId: string, value: string) => {
  const text = value.trim().slice(0, 2000)
  if (!text) throw new Error('MESSAGE_EMPTY')
  const { data: auth } = await getSupabase().auth.getUser()
  if (!auth.user) throw new Error('AUTH_REQUIRED')
  return insertMessage({ conversation_id: conversationId, sender_id: auth.user.id, recipient_id: recipientId, kind: 'text', text_content: text })
}

export const sendDirectImage = async (conversationId: string, recipientId: string, file: File) => {
  if (!supportedImageTypes.has(file.type)) throw new Error('IMAGE_TYPE_INVALID')
  if (file.size > MAX_DIRECT_MESSAGE_IMAGE_SIZE) throw new Error('IMAGE_TOO_LARGE')
  const { data: auth } = await getSupabase().auth.getUser()
  if (!auth.user) throw new Error('AUTH_REQUIRED')
  const extension = file.name.split('.').pop()?.replace(/[^a-z0-9]/gi, '').toLowerCase() || 'image'
  const path = `${conversationId}/${auth.user.id}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await getSupabase().storage.from(imageBucket).upload(path, file, { cacheControl: '3600', contentType: file.type, upsert: false })
  if (uploadError) throw uploadError
  try {
    return await insertMessage({
      conversation_id: conversationId,
      sender_id: auth.user.id,
      recipient_id: recipientId,
      kind: 'image',
      storage_path: path,
      image_name: file.name.slice(0, 160),
      image_mime: file.type,
      image_size: file.size,
    })
  } catch (error) {
    await getSupabase().storage.from(imageBucket).remove([path])
    throw error
  }
}

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
