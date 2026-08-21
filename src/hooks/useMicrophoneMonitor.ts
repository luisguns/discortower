import { useCallback, useEffect, useRef, useState } from 'react'
import { LocalAudioTrack, RoomEvent, Track, type Room } from 'livekit-client'
import {
  getMicrophoneMonitorVolume,
  saveMicrophoneMonitorVolume,
} from '../storage/preferences'

interface MonitorGraph {
  audio: HTMLAudioElement
  context: AudioContext
  gain: GainNode
  source: MediaStreamAudioSourceNode
  destination: MediaStreamAudioDestinationNode
  track: MediaStreamTrack
}

const audioContextConstructor = () => {
  const candidate = window.AudioContext ?? (
    window as typeof window & { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext
  return candidate
}

export const useMicrophoneMonitor = (
  room: Room,
  outputDeviceId: string,
  sourceRevision: string,
) => {
  const [enabled, setEnabledState] = useState(false)
  const [volume, setVolumeState] = useState(getMicrophoneMonitorVolume)
  const [error, setError] = useState('')
  const [trackRevision, setTrackRevision] = useState(0)
  const graphRef = useRef<MonitorGraph | null>(null)
  const supported = Boolean(audioContextConstructor())

  useEffect(() => {
    const refresh = () => setTrackRevision((current) => current + 1)
    room.on(RoomEvent.LocalTrackPublished, refresh)
    room.on(RoomEvent.LocalTrackUnpublished, refresh)
    return () => {
      room.off(RoomEvent.LocalTrackPublished, refresh)
      room.off(RoomEvent.LocalTrackUnpublished, refresh)
    }
  }, [room])

  useEffect(() => {
    let cancelled = false

    const destroyGraph = () => {
      const graph = graphRef.current
      graphRef.current = null
      if (!graph) return
      graph.audio.pause()
      graph.audio.srcObject = null
      graph.source.disconnect()
      graph.gain.disconnect()
      graph.destination.disconnect()
      graph.track.stop()
      void graph.context.close()
    }

    destroyGraph()
    if (!enabled || !supported) return destroyGraph

    const start = async () => {
      const publication = room.localParticipant.getTrackPublication(Track.Source.Microphone)
      if (!(publication?.track instanceof LocalAudioTrack)) return

      const Context = audioContextConstructor()
      if (!Context) return

      const monitorTrack = publication.track.mediaStreamTrack.clone()
      monitorTrack.enabled = true
      const context = new Context()
      const source = context.createMediaStreamSource(new MediaStream([monitorTrack]))
      const gain = context.createGain()
      const destination = context.createMediaStreamDestination()
      const audio = new Audio()

      gain.gain.value = volume
      source.connect(gain)
      gain.connect(destination)
      audio.autoplay = true
      audio.srcObject = destination.stream

      try {
        if (outputDeviceId && typeof audio.setSinkId === 'function') {
          await audio.setSinkId(outputDeviceId)
        }
      } catch {
        // Fall back to the system output if the saved device disappeared.
      }

      if (cancelled) {
        audio.srcObject = null
        source.disconnect()
        gain.disconnect()
        destination.disconnect()
        monitorTrack.stop()
        void context.close()
        return
      }

      graphRef.current = { audio, context, gain, source, destination, track: monitorTrack }
      try {
        await context.resume()
        await audio.play()
        if (!cancelled) setError('')
      } catch {
        destroyGraph()
        if (!cancelled) {
          setEnabledState(false)
          setError('O sistema bloqueou o retorno do microfone. Tente ativá-lo novamente.')
        }
      }
    }

    void start()
    return () => {
      cancelled = true
      destroyGraph()
    }
  }, [enabled, outputDeviceId, room, sourceRevision, supported, trackRevision])

  useEffect(() => {
    const graph = graphRef.current
    if (!graph) return
    graph.gain.gain.setTargetAtTime(volume, graph.context.currentTime, 0.015)
  }, [volume])

  const setEnabled = useCallback((nextEnabled: boolean) => {
    setError('')
    setEnabledState(nextEnabled)
  }, [])

  const setVolume = useCallback((nextVolume: number) => {
    const clamped = Math.min(2, Math.max(0, nextVolume))
    setVolumeState(clamped)
    saveMicrophoneMonitorVolume(clamped)
  }, [])

  return {
    enabled,
    volume,
    supported,
    error,
    clearError: () => setError(''),
    setEnabled,
    setVolume,
  }
}
