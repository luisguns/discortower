import { Room, Track } from '@gunns-dev/control-tower-client'
import { createElement, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { useScreenShare } from '../src/hooks/useScreenShare'

const output = document.querySelector('pre')
const report = (value) => { output.textContent += `${JSON.stringify(value)}\n` }
document.querySelector('button').onclick = async () => {
  output.textContent = ''
  const { url, tokens } = await fetch('/fixture').then(r => r.json())
  const room = new Room({ dynacast: true })
  const viewer = new Room()
  const originalCapture = navigator.mediaDevices.getDisplayMedia
  const context = new AudioContext()
  const timers = []
  const mount = document.createElement('div')
  document.body.append(mount)
  const root = createRoot(mount)
  let controls
  const Controls = () => {
    const sharing = useScreenShare(room, '720p30')
    useEffect(() => { controls = sharing })
    return createElement('p', null, sharing.error || (sharing.isSharing ? 'Sharing' : 'Stopped'))
  }
  navigator.mediaDevices.getDisplayMedia = async () => {
    const canvas = document.createElement('canvas')
    canvas.width = 1280; canvas.height = 720
    const paint = canvas.getContext('2d')
    timers.push(setInterval(() => {
      paint.fillStyle = '#7c8cff'; paint.fillRect(0, 0, 1280, 720)
      paint.fillStyle = '#fff7fa'; paint.font = '60px sans-serif'
      paint.fillText(`Synthetic ${Date.now()}`, 50, 100)
    }, 50))
    const stream = canvas.captureStream(20)
    const audio = context.createMediaStreamDestination()
    const oscillator = context.createOscillator()
    oscillator.connect(audio); oscillator.start()
    stream.addTrack(audio.stream.getAudioTracks()[0])
    return stream
  }
  try {
    await context.resume()
    await room.connect(url, tokens[0])
    // Mirrors a call with a microphone, but uses silent synthetic audio.
    const mic = context.createMediaStreamDestination()
    await room.localParticipant.publishTrack(mic.stream.getAudioTracks()[0], { source: Track.Source.Microphone })
    root.render(createElement(Controls))
    while (!controls) await new Promise(r => setTimeout(r, 20))
    for (let cycle = 1; cycle <= 3; cycle++) {
      if (cycle === 3) await viewer.connect(url, tokens[2])
      report({ cycle, action: 'start' })
      await controls.start()
      await new Promise(r => setTimeout(r, 1000))
      if (controls.error) throw new Error(controls.error)
      if (!room.localParticipant.isScreenShareEnabled) throw new Error('Share did not start')
      report({ cycle, action: 'started', publications: room.localParticipant.publications.size })
      if (cycle === 3) {
        let publication
        const deadline = Date.now() + 8000
        while (!publication?.videoTrack && Date.now() < deadline) {
          publication = [...viewer.remoteParticipants.values()][0]?.getTrackPublication(Track.Source.ScreenShare)
          await new Promise(r => setTimeout(r, 50))
        }
        if (!publication?.videoTrack) throw new Error('Viewer never received the screen track')
        const video = document.createElement('video')
        video.muted = true; video.autoplay = true; video.width = 320
        document.body.append(video)
        try {
          publication.videoTrack.attach(video)
          await video.play()
          await new Promise((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error('Viewer did not decode a video frame')), 8000)
            video.requestVideoFrameCallback((_now, metadata) => {
              clearTimeout(timer)
              report({ action: 'viewer-decoded-frame', width: metadata.width, height: metadata.height })
              resolve()
            })
          })
        } finally { publication.videoTrack?.detach(video); video.remove() }
      }
      if (cycle === 2) {
        const track = room.localParticipant.getTrackPublication(Track.Source.ScreenShare).track.mediaStreamTrack
        track.stop()
        // A native stop fires ended; MediaStreamTrack.stop() itself does not.
        track.dispatchEvent(new Event('ended'))
      } else await controls.stop()
      report({ cycle, action: 'stopped', publications: room.localParticipant.publications.size })
    }
    await room.disconnect()
    await viewer.disconnect()
    const rejoined = new Room()
    try {
      await rejoined.connect(url, tokens[1])
      report({ action: 'rejoined', remotePeers: rejoined.remoteParticipants.size })
      if (rejoined.remoteParticipants.size) throw new Error('Previous session still in room after leave')
    } finally { await rejoined.disconnect() }
    report({ result: 'PASS' })
  } catch (error) {
    report({ result: 'FAIL', message: error.message, stack: error.stack })
  } finally {
    root.unmount()
    mount.remove()
    await room.disconnect()
    await viewer.disconnect()
    navigator.mediaDevices.getDisplayMedia = originalCapture
    timers.forEach(clearInterval)
    await context.close()
  }
}
