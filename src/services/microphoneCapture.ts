export type MicrophoneCaptureResult =
  | { track: MediaStreamTrack; error?: never }
  | { track: null; error?: unknown }

/** Capture after the join click, but keep ownership until leave/failure/timeout.
 * Cancelling also stops a stream returned by a late browser permission prompt.
 * The result never rejects while token/signaling work is still pending.
 */
export const startMicrophoneCapture = (
  options: MediaTrackConstraints,
  capture = (constraints: MediaStreamConstraints) => navigator.mediaDevices.getUserMedia(constraints),
) => {
  let cancelled = false
  let stream: MediaStream | undefined
  const cancel = () => {
    cancelled = true
    stream?.getTracks().forEach((track) => track.stop())
  }
  const result: Promise<MicrophoneCaptureResult> = (async () => {
    try {
      stream = await capture({ audio: options, video: false })
      if (cancelled) {
        cancel()
        return { track: null }
      }
      const track = stream.getAudioTracks()[0]
      if (!track) {
        cancel()
        return { track: null, error: new DOMException('No microphone', 'NotFoundError') }
      }
      return { track }
    } catch (error) {
      return { track: null, error }
    }
  })()
  return { result, cancel }
}
