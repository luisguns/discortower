import { getCallSoundsEnabled } from '../storage/preferences'

export type CallSound =
  | 'join'
  | 'leave'
  | 'mute'
  | 'unmute'
  | 'deafen'
  | 'undeafen'

let audioContext: AudioContext | null = null

const getAudioContext = () => {
  if (audioContext) return audioContext
  if (typeof window === 'undefined') return null

  const AudioContextConstructor = window.AudioContext ?? (
    window as typeof window & { webkitAudioContext?: typeof AudioContext }
  ).webkitAudioContext
  if (!AudioContextConstructor) return null

  audioContext = new AudioContextConstructor()
  return audioContext
}

const tone = (
  context: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
) => {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const filter = context.createBiquadFilter()

  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, start)
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(2_400, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)

  oscillator.connect(filter)
  filter.connect(gain)
  gain.connect(context.destination)
  oscillator.start(start)
  oscillator.stop(start + duration + 0.02)
}

const playPattern = (context: AudioContext, sound: CallSound) => {
  const now = context.currentTime + 0.015

  switch (sound) {
    case 'join':
      tone(context, 392, now, 0.17, 0.045, 'triangle')
      tone(context, 523.25, now + 0.105, 0.23, 0.052, 'triangle')
      tone(context, 659.25, now + 0.105, 0.23, 0.018, 'sine')
      break
    case 'leave':
      tone(context, 523.25, now, 0.17, 0.043, 'triangle')
      tone(context, 349.23, now + 0.105, 0.22, 0.047, 'triangle')
      break
    case 'mute':
      tone(context, 330, now, 0.105, 0.036, 'triangle')
      tone(context, 220, now + 0.06, 0.13, 0.042, 'triangle')
      break
    case 'unmute':
      tone(context, 277.18, now, 0.105, 0.036, 'triangle')
      tone(context, 415.3, now + 0.06, 0.14, 0.043, 'triangle')
      break
    case 'deafen':
      tone(context, 196, now, 0.15, 0.046, 'sine')
      tone(context, 196, now + 0.115, 0.15, 0.04, 'sine')
      break
    case 'undeafen':
      tone(context, 293.66, now, 0.13, 0.038, 'sine')
      tone(context, 440, now + 0.095, 0.17, 0.044, 'sine')
      break
  }
}

export const primeCallSounds = () => {
  if (!getCallSoundsEnabled()) return
  const context = getAudioContext()
  if (context?.state === 'suspended') {
    void context.resume().catch(() => undefined)
  }
}

export const playCallSound = (sound: CallSound) => {
  if (!getCallSoundsEnabled()) return
  const context = getAudioContext()
  if (!context) return

  const play = () => playPattern(context, sound)
  if (context.state === 'suspended') {
    void context.resume().then(play).catch(() => undefined)
    return
  }
  play()
}
