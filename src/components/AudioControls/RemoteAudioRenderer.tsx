import { useEffect, useRef } from 'react'
import type { RemoteAudioTrack } from 'livekit-client'

interface RemoteAudioRendererProps {
  track?: RemoteAudioTrack
  volume: number
  deafened: boolean
  outputDeviceId: string
}

export const RemoteAudioRenderer = ({
  track,
  volume,
  deafened,
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
    if (!track) return
    track.setVolume(deafened ? 0 : volume)
  }, [deafened, track, volume])

  useEffect(() => {
    if (!track) return
    void track.setSinkId(outputDeviceId).catch(() => {
      // A saved output can disappear; the browser safely keeps its default output.
    })
  }, [outputDeviceId, track])

  return <audio autoPlay className="remote-audio" ref={audioRef} />
}
