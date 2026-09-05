import type { AccessContext, ChannelParticipantPresence, ChannelPresence, ChannelSummary, DirectMessage, SocialOverview } from '../types'

// This showcase is intentionally available only to Vite's local development server.
// It lets us produce Store screenshots without writing demonstration data to production.
export const isStoreDemo = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get('store-demo') === '1'

const now = '2026-09-04T22:10:00.000Z'

export const storeDemoAccess: AccessContext = {
  userId: 'demo-kai',
  isAdmin: false,
  role: 'member',
  capabilities: {
    canCreateChannel: false,
    canManageAllChannels: false,
    canManageUsers: false,
    canInviteManagers: false,
    canModerateAllCalls: false,
    canHighQualityScreenShare: false,
  },
  profile: {
    userId: 'demo-kai',
    displayName: 'Kai',
    username: 'kai_play',
    usernameConfigured: true,
    status: 'active',
    role: 'member',
    createdAt: now,
  },
}

export const storeDemoActivity = { id: 'valorant', slug: 'valorant', displayName: 'VALORANT', kind: 'game' as const }

export const storeDemoChannels: ChannelSummary[] = [
  {
    id: 'demo-squad', name: 'Squad da noite', createdBy: 'luis', status: 'active', participantCount: 3, callStartedAt: now, canManage: false,
    calls: [{ id: 'demo-ranked', channelId: 'demo-squad', name: 'Ranqueada · Ascendant', createdBy: 'luis', status: 'active', participantCount: 3, callStartedAt: now, canManage: false }],
  },
  {
    id: 'demo-resenha', name: 'Resenha pós-game', createdBy: 'nina', status: 'active', participantCount: 2, callStartedAt: now, canManage: false,
    calls: [{ id: 'demo-chill', channelId: 'demo-resenha', name: 'Só de boa', createdBy: 'nina', status: 'active', participantCount: 2, callStartedAt: now, canManage: false }],
  },
  {
    id: 'demo-lobby', name: 'Lobby aberto', createdBy: 'luis', status: 'active', participantCount: 0, canManage: false,
    calls: [{ id: 'demo-lobby-call', channelId: 'demo-lobby', name: 'Procurando squad', createdBy: 'luis', status: 'active', participantCount: 0, canManage: false }],
  },
]

const luis: ChannelParticipantPresence = { userId: 'luis', displayName: 'Luis', joinedAt: '2026-09-04T21:10:00.000Z', screenSharing: true, activity: { id: 'valorant', slug: 'valorant', displayName: 'VALORANT', kind: 'game' } }
const nina: ChannelParticipantPresence = { userId: 'nina', displayName: 'Nina', joinedAt: '2026-09-04T21:14:00.000Z', screenSharing: false, activity: { id: 'league', slug: 'league-of-legends', displayName: 'League of Legends', kind: 'game' } }
const rafa: ChannelParticipantPresence = { userId: 'rafa', displayName: 'Rafa', joinedAt: '2026-09-04T21:18:00.000Z', screenSharing: false }

const callParticipants = [luis, nina, rafa]
const demoMembers = (participants: ChannelParticipantPresence[]) => participants.map((participant) => ({
  userId: participant.userId || participant.displayName.toLowerCase(),
  displayName: participant.displayName,
  avatarDataUrl: participant.avatarDataUrl,
  nameStyle: participant.nameStyle,
  joinedAt: participant.joinedAt,
  online: true,
}))

export const storeDemoPresence: ChannelPresence[] = [
  {
    channelId: 'demo-squad', callActive: true, screenSharing: true,
    members: demoMembers(callParticipants),
    participants: callParticipants,
    calls: [{ callId: 'demo-ranked', name: 'Ranqueada · Ascendant', callActive: true, participantCount: 3, participants: callParticipants }],
  },
  {
    channelId: 'demo-resenha', callActive: true, screenSharing: false,
    members: demoMembers([luis, nina]),
    participants: [luis, nina],
    calls: [{ callId: 'demo-chill', name: 'Só de boa', callActive: true, participantCount: 2, participants: [luis, nina] }],
  },
  { channelId: 'demo-lobby', callActive: false, screenSharing: false, members: [], participants: [], calls: [{ callId: 'demo-lobby-call', name: 'Procurando squad', callActive: false, participantCount: 0, participants: [] }] },
]

export const storeDemoSocial: SocialOverview = {
  friends: [
    { userId: 'luis', friendshipId: 'demo-friend-luis', displayName: 'Luis', username: 'luisgunns', online: true, activity: luis.activity },
    { userId: 'nina', friendshipId: 'demo-friend-nina', displayName: 'Nina', username: 'ninafps', online: true, activity: nina.activity },
    { userId: 'rafa', friendshipId: 'demo-friend-rafa', displayName: 'Rafa', username: 'rafinha', online: false },
  ],
  incoming: [], outgoing: [], blocked: [],
  conversations: [
    { id: 'demo-conversation-luis', friend: { userId: 'luis', displayName: 'Luis', username: 'luisgunns' }, friendshipStatus: 'accepted', lastMessage: { id: 3, senderId: 'luis', kind: 'text', text: 'Fechou, te puxo quando a partida acabar.', createdAt: '2026-09-04T21:58:00.000Z' }, lastMessageAt: '2026-09-04T21:58:00.000Z', unreadCount: 1 },
    { id: 'demo-conversation-nina', friend: { userId: 'nina', displayName: 'Nina', username: 'ninafps' }, friendshipStatus: 'accepted', lastMessage: { id: 4, senderId: 'demo-kai', kind: 'text', text: 'Bora depois dessa!', createdAt: '2026-09-04T21:44:00.000Z' }, lastMessageAt: '2026-09-04T21:44:00.000Z', unreadCount: 0 },
  ],
}

export const storeDemoMessages: DirectMessage[] = [
  { id: 'demo-message-1', conversationId: 'demo-conversation-luis', senderId: 'luis', recipientId: 'demo-kai', kind: 'text', text: 'Kai, estamos fechando uma ranked. Vem com a gente?', createdAt: '2026-09-04T21:52:00.000Z' },
  { id: 'demo-message-2', conversationId: 'demo-conversation-luis', senderId: 'demo-kai', recipientId: 'luis', kind: 'text', text: 'Bora! Só vou ajustar o áudio e entro.', createdAt: '2026-09-04T21:55:00.000Z' },
  { id: 'demo-message-3', conversationId: 'demo-conversation-luis', senderId: 'luis', recipientId: 'demo-kai', kind: 'text', text: 'Fechou, te puxo quando a partida acabar.', createdAt: '2026-09-04T21:58:00.000Z' },
]
