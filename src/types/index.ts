import type {
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteVideoTrack,
} from 'livekit-client'

export type ConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error'

export type StreamQualityId = '720p30' | '1080p30' | '1080p60'

export type GalleryLayoutMode = 'cinema' | 'expanded'

export type AudioChannel = 'voice' | 'screen'

export type ShortcutAction =
  | 'microphone'
  | 'deafen'
  | 'camera'
  | 'screenShare'
  | 'leave'

export type ShortcutBindings = Record<ShortcutAction, string>

export type AppUpdateStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'upToDate'
  | 'error'
  | 'unsupported'

export interface AppUpdateState {
  status: AppUpdateStatus
  currentVersion: string
  availableVersion?: string
  percent?: number
  message?: string
}

export type ProfileNameFont = 'mono' | 'condensed' | 'rounded' | 'serif'
export type ProfileNameEffect = 'none' | 'glow' | 'shadow' | 'outline'
export type ProfileNameSpacing = 'tight' | 'normal' | 'wide'
export type ProfileNameCase = 'normal' | 'uppercase'
export type ProfileNameBadge = 'none' | 'soft' | 'outline' | 'pill'
export type ProfileNameAnimation = 'none' | 'breathe' | 'spark' | 'float'

export interface ProfileNameStyle {
  font: ProfileNameFont
  color: string
  effect: ProfileNameEffect
  weight: 500 | 600 | 700
  spacing: ProfileNameSpacing
  casing: ProfileNameCase
  badge: ProfileNameBadge
  animation: ProfileNameAnimation
}

export interface LocalProfile {
  displayName: string
  avatarDataUrl?: string
  nameStyle?: ProfileNameStyle
}

export type AccountStatus = 'active' | 'disabled'

export type AccountRole = 'owner' | 'manager' | 'host' | 'member'
export type ChannelMemberRole = 'owner' | 'admin' | 'member'

export interface AccessCapabilities {
  canCreateChannel: boolean
  canManageAllChannels: boolean
  canManageUsers: boolean
  canInviteManagers: boolean
  canModerateAllCalls: boolean
  canHighQualityScreenShare: boolean
}

export interface AccountProfile extends LocalProfile {
  userId: string
  username?: string
  usernameConfigured: boolean
  email?: string
  status: AccountStatus
  role: AccountRole
  createdAt?: string
  updatedAt?: string
}

export type FriendshipStatus = 'pending' | 'accepted' | 'removed'

export interface FriendProfile {
  userId: string
  username: string
  displayName: string
  avatarDataUrl?: string
  nameStyle?: ProfileNameStyle
}

export interface FriendSummary extends FriendProfile {
  friendshipId: string
  online: boolean
  activity?: RecognizedActivity
}

export interface FriendRequestSummary extends FriendProfile {
  friendshipId: string
  requestedAt: string
}

export interface BlockedUserSummary extends FriendProfile {
  blockedAt: string
}

export type DirectMessageKind = 'text' | 'image'
export type DirectMessageStatus = 'sending' | 'sent' | 'error'

export interface DirectMessage {
  id: number | string
  conversationId: string
  senderId: string
  recipientId: string
  kind: DirectMessageKind
  text?: string
  imageUrl?: string
  imageName?: string
  imageMime?: string
  imageSize?: number
  storagePath?: string
  createdAt: string
  deletedAt?: string
  status?: DirectMessageStatus
  localId?: string
}

export interface DirectConversationSummary {
  id: string
  friend: FriendProfile
  friendshipStatus: FriendshipStatus
  lastMessage: { id: number; senderId: string; kind: DirectMessageKind; text?: string; createdAt: string } | null
  lastMessageAt?: string
  unreadCount: number
}

export interface SocialOverview {
  friends: FriendSummary[]
  incoming: FriendRequestSummary[]
  outgoing: FriendRequestSummary[]
  blocked: BlockedUserSummary[]
  conversations: DirectConversationSummary[]
}

export interface AccessContext {
  userId: string
  profile: AccountProfile
  isAdmin: boolean
  role: AccountRole
  capabilities: AccessCapabilities
}

export interface ChannelSummary {
  id: string
  name: string
  createdBy: string
  status: 'active' | 'archived'
  participantCount: number
  callStartedAt?: string
  reopenAfter?: string
  canManage: boolean
  memberRole?: ChannelMemberRole
  calls?: ChannelCallSummary[]
}

export interface ChannelCallSummary {
  id: string
  channelId: string
  name: string
  status: 'active' | 'archived'
  createdBy: string
  participantCount: number
  callStartedAt?: string
  canManage: boolean
}

export interface RecognizedActivity {
  id: string
  slug: string
  displayName: string
  kind: 'game' | 'ide'
  iconDataUrl?: string
}

export interface ActivityCatalogItem extends RecognizedActivity {
  processNames: string[]
}

export interface ChannelParticipantPresence {
  userId?: string
  displayName: string
  avatarDataUrl?: string
  nameStyle?: ProfileNameStyle
  joinedAt: string
  screenSharing: boolean
  activity?: RecognizedActivity
}

export interface ChannelMemberPresence {
  userId: string
  displayName: string
  avatarDataUrl?: string
  nameStyle?: ProfileNameStyle
  joinedAt: string
  online: boolean
}

export interface ChannelPresence {
  channelId: string
  callActive: boolean
  screenSharing: boolean
  members: ChannelMemberPresence[]
  participants: ChannelParticipantPresence[]
  calls: ChannelCallPresence[]
}

export interface ChannelCallPresence {
  callId: string
  name: string
  callActive: boolean
  participantCount: number
  participants: ChannelParticipantPresence[]
}

export interface RemoteVoice {
  id: string
  participant: RemoteParticipant
  track?: RemoteAudioTrack
  muted: boolean
}

export interface ScreenShareLive {
  id: string
  participantIdentity: string
  participantName: string
  isLocal: boolean
  videoTrack?: LocalVideoTrack | RemoteVideoTrack
  audioTrack?: RemoteAudioTrack
  videoPublication?: RemoteTrackPublication
  audioPublication?: RemoteTrackPublication
  subscribed: boolean
  hasAudio: boolean
  muted: boolean
}

export interface ParticipantMedia {
  id: string
  name: string
  avatarDataUrl?: string
  nameStyle?: ProfileNameStyle
  isLocal: boolean
  cameraTrack?: LocalVideoTrack | RemoteVideoTrack
  cameraEnabled: boolean
  microphoneMuted: boolean
}

export interface DevicePreferences {
  inputId: string
  videoInputId: string
  voiceOutputId: string
  screenOutputId: string
}

export interface ChatMessage {
  id: string
  kind: 'text' | 'image'
  senderIdentity: string
  senderName: string
  senderAvatarUrl?: string
  senderNameStyle?: ProfileNameStyle
  isLocal: boolean
  sentAt: number
  text?: string
  imageUrl?: string
  imageName?: string
  status?: 'sending' | 'sent' | 'error'
}

export interface ContextMenuPoint {
  x: number
  y: number
}
