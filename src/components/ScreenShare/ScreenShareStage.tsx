import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import type { LocalVideoTrack, RemoteVideoTrack } from 'livekit-client'
import { useParticipantVolume } from '../../hooks/useParticipantVolume'
import type { ParticipantMedia, ScreenShareLive } from '../../types'
import { RemoteAudioRenderer } from '../AudioControls/RemoteAudioRenderer'
import { VolumeControl } from '../AudioControls/VolumeControl'
import { ParticipantGallery } from '../Participants/ParticipantGallery'
import { Icon } from '../ui/Icon'

const VideoRenderer = ({
  track,
  videoRef,
}: {
  track: LocalVideoTrack | RemoteVideoTrack
  videoRef: RefObject<HTMLVideoElement | null>
}) => {
  useEffect(() => {
    const element = videoRef.current
    if (!element) return
    track.attach(element)
    return () => {
      track.detach(element)
      element.pause()
      element.srcObject = null
      element.removeAttribute('src')
      element.load()
    }
  }, [track, videoRef])

  return <video autoPlay muted playsInline ref={videoRef} />
}

interface LiveControlsProps {
  live: ScreenShareLive
  deafened: boolean
  screenOutputId: string
  open: boolean
  onClose: () => void
}

const LiveAudioControls = ({
  live,
  deafened,
  screenOutputId,
  open,
  onClose,
}: LiveControlsProps) => {
  const [volume, setVolume] = useParticipantVolume(live.participantIdentity, 'screen')
  const [mutedLocally, setMutedLocally] = useState(false)

  return (
    <>
      {!live.isLocal && (
        <RemoteAudioRenderer
          deafened={deafened}
          muted={mutedLocally || live.muted}
          outputDeviceId={screenOutputId}
          track={live.audioTrack}
          volume={volume}
        />
      )}

      {open && (
        <div aria-label="Controles da transmissão" className="live-controls-popover" role="dialog">
          <header>
            <div>
              <small>TRANSMISSÃO</small>
              <strong>{live.participantName}</strong>
            </div>
            <button aria-label="Fechar controles da transmissão" className="icon-button" onClick={onClose} type="button">
              <Icon name="x" />
            </button>
          </header>

          {live.isLocal ? (
            <p>Sua tela está no ar. Use o botão do dock para encerrar a transmissão.</p>
          ) : live.audioTrack ? (
            <div className="live-controls-popover__section">
              <div>
                <span>Áudio só para você</span>
                <small>Volume independente da voz</small>
              </div>
              <VolumeControl
                label={`Volume da transmissão de ${live.participantName}`}
                muted={mutedLocally || live.muted}
                onChange={setVolume}
                onMuteToggle={() => setMutedLocally((current) => !current)}
                value={volume}
              />
            </div>
          ) : (
            <p>Essa transmissão chegou sem uma faixa de áudio compartilhada.</p>
          )}
        </div>
      )}
    </>
  )
}

interface ScreenShareStageProps {
  lives: ScreenShareLive[]
  participants: ParticipantMedia[]
  activeSpeakerIds: Set<string>
  deafened: boolean
  screenOutputId: string
  onParticipantSelect: (participantId: string) => void
}

export const ScreenShareStage = ({
  lives,
  participants,
  activeSpeakerIds,
  deafened,
  screenOutputId,
  onParticipantSelect,
}: ScreenShareStageProps) => {
  const [selectedId, setSelectedId] = useState('')
  const [controlsOpen, setControlsOpen] = useState(false)
  const knownIds = useRef<Set<string>>(new Set())
  const stageRef = useRef<HTMLDivElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const popoutWindowRef = useRef<Window | null>(null)
  const popoutVideoRef = useRef<HTMLVideoElement | null>(null)
  const popoutTrackRef = useRef<LocalVideoTrack | RemoteVideoTrack | null>(null)
  const [pipActive, setPipActive] = useState(false)
  const [popoutActive, setPopoutActive] = useState(false)
  const [fullscreenActive, setFullscreenActive] = useState(false)
  const [stageError, setStageError] = useState('')

  const pipSupported =
    typeof document !== 'undefined' &&
    document.pictureInPictureEnabled &&
    'requestPictureInPicture' in HTMLVideoElement.prototype

  useEffect(() => {
    const currentIds = new Set(lives.map((live) => live.id))
    const newest = [...lives].reverse().find((live) => !knownIds.current.has(live.id))
    if (newest) setSelectedId(newest.id)
    else if (!currentIds.has(selectedId)) setSelectedId(lives.at(-1)?.id ?? '')
    knownIds.current = currentIds
  }, [lives, selectedId])

  const selectedLive = lives.find((live) => live.id === selectedId) ?? lives.at(-1)

  const closePopout = useCallback((shouldCloseWindow = true) => {
    const popup = popoutWindowRef.current
    const video = popoutVideoRef.current
    const track = popoutTrackRef.current

    popoutWindowRef.current = null
    popoutVideoRef.current = null
    popoutTrackRef.current = null

    if (track && video) track.detach(video)
    if (video) {
      video.pause()
      video.srcObject = null
      video.removeAttribute('src')
      video.remove()
    }

    setPopoutActive(false)
    if (shouldCloseWindow && popup && !popup.closed) popup.close()
  }, [])

  useEffect(() => {
    setControlsOpen(false)
    const video = videoRef.current
    if (!video) return
    const handleEnter = () => setPipActive(true)
    const handleLeave = () => setPipActive(false)
    video.addEventListener('enterpictureinpicture', handleEnter)
    video.addEventListener('leavepictureinpicture', handleLeave)
    return () => {
      video.removeEventListener('enterpictureinpicture', handleEnter)
      video.removeEventListener('leavepictureinpicture', handleLeave)
    }
  }, [selectedLive?.id])

  useEffect(() => {
    const handleFullscreenChange = () => {
      setFullscreenActive(document.fullscreenElement === stageRef.current)
    }
    document.addEventListener('fullscreenchange', handleFullscreenChange)
    handleFullscreenChange()
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange)
  }, [])

  useEffect(
    () => () => {
      closePopout()
    },
    [closePopout, selectedLive?.id],
  )

  const togglePictureInPicture = async () => {
    const video = videoRef.current
    if (!video || !pipSupported) return
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture()
      else await video.requestPictureInPicture()
    } catch {
      setPipActive(false)
    }
  }

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await stageRef.current?.requestFullscreen()
      setStageError('')
    } catch {
      setStageError('O navegador não conseguiu alterar o modo de tela cheia.')
    }
  }

  const togglePopout = () => {
    if (!selectedLive) return
    if (popoutWindowRef.current && !popoutWindowRef.current.closed) {
      closePopout()
      return
    }

    const popup = window.open(
      '',
      `ford-kall-stream-${selectedLive.id}`,
      'popup=yes,width=1120,height=720,resizable=yes,scrollbars=no',
    )
    if (!popup) {
      setStageError('O navegador bloqueou a janela da transmissão. Libere pop-ups para este site e tente novamente.')
      return
    }

    const style = popup.document.createElement('style')
    style.textContent = `
      :root { color-scheme: dark; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #030403; }
      * { box-sizing: border-box; }
      html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #030403; }
      body { display: grid; grid-template-rows: 42px minmax(0, 1fr); }
      .bar { display: flex; align-items: center; gap: 9px; padding: 0 14px; border-bottom: 1px solid #252b26; background: #0d100e; color: #dce2dc; font-size: 12px; }
      .bar i { width: 7px; height: 7px; border-radius: 50%; background: #ff5a5f; box-shadow: 0 0 8px rgba(255,90,95,.72); }
      video { display: block; width: 100%; height: 100%; object-fit: contain; background: #000; }
    `
    const bar = popup.document.createElement('div')
    bar.className = 'bar'
    const dot = popup.document.createElement('i')
    const title = popup.document.createElement('span')
    title.textContent = `${selectedLive.participantName} · transmissão`
    bar.append(dot, title)

    // Creating the video in the opener keeps it in the same JS realm expected
    // by the LiveKit track, then the popup adopts it when appended.
    const popupVideo = document.createElement('video')
    popupVideo.autoplay = true
    popupVideo.muted = true
    popupVideo.playsInline = true

    popup.document.title = `${selectedLive.participantName} · Ford Kall`
    popup.document.head.replaceChildren(style)
    popup.document.body.replaceChildren(bar, popupVideo)

    popoutWindowRef.current = popup
    popoutVideoRef.current = popupVideo
    popoutTrackRef.current = selectedLive.videoTrack

    try {
      selectedLive.videoTrack.attach(popupVideo)
      popup.addEventListener('pagehide', () => closePopout(false), { once: true })
      popup.focus()
      setPopoutActive(true)
      setStageError('')
    } catch {
      closePopout()
      setStageError('Não foi possível mover a transmissão para uma janela separada.')
    }
  }

  if (!selectedLive) {
    return (
      <ParticipantGallery
        activeSpeakerIds={activeSpeakerIds}
        onParticipantSelect={onParticipantSelect}
        participants={participants}
      />
    )
  }

  return (
    <section className="stream-stage" ref={stageRef}>
      <div className="stream-stage__topbar">
        <div className="stream-stage__identity">
          <span className="live-badge"><i /> AO VIVO</span>
          <strong>{selectedLive.participantName}</strong>
        </div>
        <div className="stream-stage__actions">
          <button
            aria-label="Abrir controles da transmissão"
            className={`icon-button ${controlsOpen ? 'icon-button--active' : ''}`}
            onClick={() => setControlsOpen((current) => !current)}
            title="Áudio da transmissão"
            type="button"
          >
            <Icon name="controls" />
          </button>
          <button
            aria-label={pipActive ? 'Fechar Picture-in-Picture' : 'Abrir Picture-in-Picture'}
            className={`icon-button ${pipActive ? 'icon-button--active' : ''}`}
            disabled={!pipSupported}
            onClick={() => void togglePictureInPicture()}
            title={pipSupported ? 'Picture-in-Picture' : 'PiP não suportado neste navegador'}
            type="button"
          >
            <Icon name="pip" />
          </button>
          <button
            aria-label={popoutActive ? 'Fechar janela separada' : 'Abrir transmissão em janela separada'}
            className={`icon-button ${popoutActive ? 'icon-button--active' : ''}`}
            onClick={togglePopout}
            title={popoutActive ? 'Fechar janela separada' : 'Abrir em janela separada'}
            type="button"
          >
            <Icon name="popout" />
          </button>
          <button
            aria-label={fullscreenActive ? 'Sair da tela cheia' : 'Ver transmissão em tela cheia'}
            className={`icon-button ${fullscreenActive ? 'icon-button--active' : ''}`}
            disabled={!document.fullscreenEnabled}
            onClick={() => void toggleFullscreen()}
            title={fullscreenActive ? 'Sair da tela cheia' : 'Tela cheia'}
            type="button"
          >
            <Icon name={fullscreenActive ? 'collapse' : 'expand'} />
          </button>
        </div>
      </div>

      {stageError && (
        <div className="stream-stage__message" role="alert">
          <Icon name="warning" />
          <span>{stageError}</span>
          <button aria-label="Fechar aviso" onClick={() => setStageError('')} type="button"><Icon name="x" /></button>
        </div>
      )}

      <LiveAudioControls
        key={selectedLive.id}
        deafened={deafened}
        live={selectedLive}
        onClose={() => setControlsOpen(false)}
        open={controlsOpen}
        screenOutputId={screenOutputId}
      />

      {lives.length > 1 && (
        <div className="live-switcher" aria-label="Escolher transmissão">
          {lives.map((live) => (
            <button
              className={live.id === selectedLive.id ? 'is-active' : ''}
              key={live.id}
              onClick={() => setSelectedId(live.id)}
              type="button"
            >
              <i /> {live.participantName}
            </button>
          ))}
        </div>
      )}

      <div className="stream-stage__content">
        <div className="stream-stage__video">
          <VideoRenderer track={selectedLive.videoTrack} videoRef={videoRef} />
        </div>

        <ParticipantGallery
          activeSpeakerIds={activeSpeakerIds}
          compact
          onParticipantSelect={onParticipantSelect}
          participants={participants}
        />
      </div>
    </section>
  )
}
