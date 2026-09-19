import { RoomEvent, Track, type Room } from '@gunns-dev/control-tower-client'
import { observe, reportFailure, getCallContext } from './observability'
import { createConditionMonitor } from './diagnosticState'

const observedRooms = new WeakMap<Room, () => void>()
export function observeRoom(room: Room) {
  if (observedRooms.has(room)) return
  const listeners: Array<[string, (...args: unknown[]) => void]> = []
  let stopped = false, busy = false
  const context = getCallContext()
  const emit: typeof observe = (event, fields, level) => observe(event, { ...context, ...fields }, level)
  const conditions = createConditionMonitor(emit)
  let previousState = room.state, lastStats = 0
  let transitions: number[] = []
  for (const event of [RoomEvent.ConnectionStateChanged, RoomEvent.Disconnected,
    RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected,
    RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.TrackSubscribed,
    RoomEvent.TrackUnsubscribed, RoomEvent.TrackSubscriptionStatusChanged,
    RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished,
    RoomEvent.LocalTrackUnpublished, RoomEvent.MediaDevicesChanged, RoomEvent.AudioPlaybackStatusChanged]) {
    const listener = (...args: unknown[]) => {
      const publication = args.find(value => value && typeof value === 'object' && 'trackSid' in value) as { trackSid?: string; source?: string; isDesired?: boolean; isMuted?: boolean } | undefined
      if (event === RoomEvent.ConnectionStateChanged && room.state !== previousState) {
        transitions = transitions.filter(time => performance.now() - time < 60_000)
        transitions.push(performance.now())
      }
      emit(`rtc.${event}`, {
        state: room.state, peers: room.remoteParticipants.size,
        previous_state: previousState,
        publication_id: publication?.trackSid, source: publication?.source,
        desired: publication?.isDesired, muted: publication?.isMuted,
        reason: typeof args[0] === 'number' ? args[0] : undefined,
      })
      previousState = room.state
    }
    room.on(event, listener)
    listeners.push([event, listener])
  }
  const inspect = () => {
    const connected = room.state === 'connected'
    const keys = new Set(['connection', 'flapping', 'capture', 'duplicates'])
    const fields = { state: room.state, peers: room.remoteParticipants.size }
    conditions.check('connection', 'rtc.connection_stuck', room.state === 'connecting' || room.state === 'reconnecting', fields, 20_000)
    transitions = transitions.filter(time => performance.now() - time < 60_000)
    conditions.check('flapping', 'rtc.connection_flapping', transitions.length >= 6, { ...fields, transitions: transitions.length }, 0)
    const local = room.localParticipant
    const publication = local.getTrackPublication(Track.Source.ScreenShare)
    conditions.check('capture', 'screen.capture_mismatch', connected && local.isScreenShareEnabled && publication?.track?.mediaStreamTrack.readyState !== 'live', {
      ...fields, publication_id: publication?.trackSid, capture_state: publication?.track?.mediaStreamTrack.readyState || 'missing',
    }, 5000)
    const accounts = new Map<string, number>()
    for (const participant of [local, ...room.remoteParticipants.values()]) {
      const account = participant.identity.match(/^usr_([0-9a-f-]{36})_[a-z0-9]+$/i)?.[1]
      if (account) accounts.set(account, (accounts.get(account) || 0) + 1)
    }
    const duplicates = [...accounts.values()].filter(count => count > 1)
    // Multiple clients can be intentional. Record a candidate, without account identities.
    conditions.check('duplicates', 'rtc.duplicate_account_candidate', connected && duplicates.length > 0, { ...fields, duplicate_groups: duplicates.length, extra_sessions: duplicates.reduce((sum, count) => sum + count - 1, 0) }, 5000)
    for (const participant of room.remoteParticipants.values()) for (const source of [Track.Source.ScreenShare, Track.Source.ScreenShareAudio, Track.Source.Camera, Track.Source.Microphone]) {
      const remote = participant.getTrackPublication(source)
      if (!remote) continue
      const key = `subscription:${remote.trackSid}`
      keys.add(key)
      conditions.check(key, 'rtc.subscription_no_media', connected && remote.isDesired && !remote.isMuted && (!remote.track || remote.track.mediaStreamTrack.readyState === 'ended'), {
        ...fields, source, publication_id: remote.trackSid, desired: remote.isDesired, track_state: remote.track?.mediaStreamTrack.readyState || 'missing',
      })
    }
    conditions.retain(keys)
  }
  const sample = async () => {
    if (busy || stopped) return
    busy = true
    try {
      const stats = typeof room.getAudioDiagnostics === 'function' ? await room.getAudioDiagnostics() : undefined
      if (stopped) return
      const publication = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)
      const video = Array.isArray(stats?.video) ? stats.video as Array<Record<string, unknown>> : []
      const sum = (key: string) => video.reduce((total, row) => total + (typeof row[key] === 'number' ? row[key] as number : 0), 0)
      emit('rtc.health', { state: room.state, peers: room.remoteParticipants.size,
        sharing: room.localParticipant.isScreenShareEnabled,
        capture_state: publication?.track?.mediaStreamTrack.readyState,
        capture_muted: publication?.track?.mediaStreamTrack.muted,
        video_streams: video.length, video_bytes_sent: sum('bytesSent'), video_bytes_received: sum('bytesReceived'),
        video_frames_encoded: sum('framesEncoded'), video_frames_decoded: sum('framesDecoded'),
        video_frames_dropped: sum('framesDropped'), video_freezes: sum('freezeCount'), video_packets_lost: sum('packetsLost'),
        diagnostics: stats ? JSON.stringify(stats) : 'unavailable',
      })
    } catch (error) {
      if (!stopped) reportFailure('rtc.health', error, context)
    } finally { busy = false }
  }
  const timer = window.setInterval(() => {
    if (stopped) return
    try { inspect() } catch (error) { reportFailure('rtc.inspect', error, context) }
    if (performance.now() - lastStats >= 15_000) { lastStats = performance.now(); void sample() }
  }, 5000)
  observedRooms.set(room, () => {
    stopped = true
    clearInterval(timer)
    conditions.clear()
    for (const [event, listener] of listeners) room.off(event, listener)
    observedRooms.delete(room)
  })
}
export function stopObservingRoom(room: Room) { observedRooms.get(room)?.() }

export function observeVideo(element: HTMLVideoElement, track: MediaStreamTrack, source: string, details: { publication_id?: string; local?: boolean } = {}) {
  let lastFrame = performance.now(), firstFrame = false, stalled = false, frameCallback = 0
  let noFirstFrame = false
  const attachedAt = performance.now(), context = getCallContext()
  const fields = () => ({ ...context, ...details, source, ready_state: track.readyState, capture_muted: track.muted,
    enabled: track.enabled, video_ready_state: element.readyState, paused: element.paused,
    visibility: document.visibilityState, width: element.videoWidth, height: element.videoHeight })
  observe('video.attached', fields())
  const frame = () => {
    lastFrame = performance.now()
    if (!firstFrame) { firstFrame = true; observe('video.first_frame', { ...fields(), duration_ms: Math.round(performance.now() - attachedAt) }); if (noFirstFrame) observe('video.no_first_frame.recovered', fields()) }
    if (stalled) { stalled = false; observe('video.recovered', fields()) }
    frameCallback = element.requestVideoFrameCallback(frame)
  }
  if (typeof element.requestVideoFrameCallback === 'function') frameCallback = element.requestVideoFrameCallback(frame)
  const timer = window.setInterval(() => {
    if (!document.hidden && !firstFrame && !noFirstFrame && performance.now() - attachedAt > 15_000 && typeof element.requestVideoFrameCallback === 'function') {
      noFirstFrame = true
      observe('video.no_first_frame', fields(), 'warn')
    }
    if (document.hidden || element.paused) { lastFrame = performance.now(); return }
    if (performance.now() - lastFrame > 15_000 && !stalled) {
      stalled = true
      // Static screens may legitimately have no frames: diagnostic, not a crash.
      observe('video.no_frames', { ...fields(), first_frame_received: firstFrame }, 'warn')
    }
  }, 5000)
  const callbacks = ['ended', 'mute', 'unmute'].map(event => {
    const callback = () => observe(`capture.${event}`, fields(), event === 'ended' ? 'warn' : 'info')
    track.addEventListener(event, callback)
    return [event, callback] as const
  })
  const playbackError = () => reportFailure('video.playback', new Error(`MEDIA_ERROR_${element.error?.code || 0}`), fields())
  element.addEventListener('error', playbackError)
  const playbackListeners = ['waiting', 'stalled', 'playing', 'pause', 'emptied'].map(event => {
    const callback = () => observe(`video.${event}`, fields())
    element.addEventListener(event, callback)
    return [event, callback] as const
  })
  return () => {
    clearInterval(timer)
    if (frameCallback) element.cancelVideoFrameCallback(frameCallback)
    for (const [event, callback] of callbacks) track.removeEventListener(event, callback)
    element.removeEventListener('error', playbackError)
    for (const [event, callback] of playbackListeners) element.removeEventListener(event, callback)
    observe('video.detached', fields())
  }
}
