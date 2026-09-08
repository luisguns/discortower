import { recordAudioEvent } from '../../services/audioDiagnostics'
import { useEffect, useRef } from 'react'
import type { RemoteAudioTrack } from '@gunns-dev/control-tower-client'

interface RemoteAudioRendererProps {
  track?: RemoteAudioTrack
  volume: number
  deafened: boolean
  muted?: boolean
  outputDeviceId: string
}

export const RemoteAudioRenderer = ({
  track,
  volume,
  deafened,
  muted = false,
  outputDeviceId,
}: RemoteAudioRendererProps) => {
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const element = audioRef.current
    if (!track || !element) return

    track.attach(element)
    return () => {
      track.detach(element)
      element.pause()
      element.srcObject = null
      element.removeAttribute('src')
      element.load()
    }
  }, [track])

  useEffect(() => {
    const element = audioRef.current
    if (!track || !element) return

    const shouldMute = deafened || muted
    const effectiveVolume = shouldMute ? 0 : volume
    track.setVolume(effectiveVolume)
    if (!shouldMute) void element.play().then(() => { track.reportPlaybackStatus?.(true); recordAudioEvent('playback-started') }).catch(() => { track.reportPlaybackStatus?.(false); recordAudioEvent('playback-blocked') })
  }, [deafened, muted, track, volume])

  useEffect(() => {
    if (!track) return
    void track.setSinkId(outputDeviceId).catch(() => {
      recordAudioEvent('output-device-failed')
      // A saved output can disappear; the browser safely keeps its default output.
    })
  }, [outputDeviceId, track])

  return <audio autoPlay className="remote-audio" ref={audioRef} onWaiting={() => recordAudioEvent('waiting')} onStalled={() => recordAudioEvent('stalled')} />
}
