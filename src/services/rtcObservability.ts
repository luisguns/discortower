import { RoomEvent, Track, type Room } from '@gunns-dev/control-tower-client'
import { observe, reportFailure } from './observability'

const observedRooms = new WeakMap<Room, () => void>()
export function observeRoom(room: Room) {
  if (observedRooms.has(room)) return
  const listeners: Array<[string, (...args: unknown[]) => void]> = []
  let stopped = false, busy = false
  for (const event of [RoomEvent.ConnectionStateChanged, RoomEvent.Disconnected,
    RoomEvent.ParticipantConnected, RoomEvent.ParticipantDisconnected,
    RoomEvent.TrackPublished, RoomEvent.TrackUnpublished, RoomEvent.TrackSubscribed,
    RoomEvent.TrackUnsubscribed, RoomEvent.TrackSubscriptionStatusChanged,
    RoomEvent.TrackMuted, RoomEvent.TrackUnmuted, RoomEvent.LocalTrackPublished,
    RoomEvent.LocalTrackUnpublished, RoomEvent.MediaDevicesChanged, RoomEvent.AudioPlaybackStatusChanged]) {
    const listener = (...args: unknown[]) => {
      const publication = args.find(value => value && typeof value === 'object' && 'trackSid' in value) as { trackSid?: string; source?: string; isDesired?: boolean; isMuted?: boolean } | undefined
      observe(`rtc.${event}`, {
        state: room.state, peers: room.remoteParticipants.size,
        publication_id: publication?.trackSid, source: publication?.source,
        desired: publication?.isDesired, muted: publication?.isMuted,
        reason: typeof args[0] === 'number' ? args[0] : undefined,
      })
    }
    room.on(event, listener)
    listeners.push([event, listener])
  }
  const sample = async () => {
    if (busy || stopped) return
    busy = true
    try {
      const stats = typeof room.getAudioDiagnostics === 'function' ? await room.getAudioDiagnostics() : undefined
      if (stopped) return
      const publication = room.localParticipant.getTrackPublication(Track.Source.ScreenShare)
      observe('rtc.health', { state: room.state, peers: room.remoteParticipants.size,
        sharing: room.localParticipant.isScreenShareEnabled,
        capture_state: publication?.track?.mediaStreamTrack.readyState,
        capture_muted: publication?.track?.mediaStreamTrack.muted,
        diagnostics: stats ? JSON.stringify(stats) : 'unavailable',
      })
    } catch (error) {
      if (!stopped) reportFailure('rtc.health', error)
    } finally { busy = false }
  }
  const timer = window.setInterval(() => { void sample() }, 15_000)
  observedRooms.set(room, () => {
    stopped = true
    clearInterval(timer)
    for (const [event, listener] of listeners) room.off(event, listener)
    observedRooms.delete(room)
  })
}
export function stopObservingRoom(room: Room) { observedRooms.get(room)?.() }

export function observeVideo(element: HTMLVideoElement, track: MediaStreamTrack, source: string) {
  let lastFrame = performance.now(), firstFrame = false, stalled = false, frameCallback = 0
  const fields = () => ({ source, ready_state: track.readyState, capture_muted: track.muted,
    enabled: track.enabled, video_ready_state: element.readyState, paused: element.paused,
    visibility: document.visibilityState, width: element.videoWidth, height: element.videoHeight })
  observe('video.attached', fields())
  const frame = () => {
    lastFrame = performance.now()
    if (!firstFrame) { firstFrame = true; observe('video.first_frame', fields()) }
    if (stalled) { stalled = false; observe('video.recovered', fields()) }
    frameCallback = element.requestVideoFrameCallback(frame)
  }
  if (typeof element.requestVideoFrameCallback === 'function') frameCallback = element.requestVideoFrameCallback(frame)
  const timer = window.setInterval(() => {
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
  return () => {
    clearInterval(timer)
    if (frameCallback) element.cancelVideoFrameCallback(frameCallback)
    for (const [event, callback] of callbacks) track.removeEventListener(event, callback)
    element.removeEventListener('error', playbackError)
    observe('video.detached', fields())
  }
}
