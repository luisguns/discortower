import { useEffect, useMemo, useState } from 'react'
import {
  getDevicePreferences,
  getGameOverlayEnabled,
  getNoiseSuppression,
  getStreamQuality,
  saveDevicePreferences,
  saveGameOverlayEnabled,
  saveNoiseSuppression,
  saveStreamQuality,
} from '../../storage/preferences'
import type { DevicePreferences, StreamQualityId } from '../../types'
import { Icon } from '../ui/Icon'

type Section = 'audio' | 'video' | 'transmission' | 'privacy'
type DeviceKind = 'audioinput' | 'audiooutput' | 'videoinput'

interface Props {
  activitySharingEnabled: boolean
  canHighQualityScreenShare: boolean
  onActivitySharingChange: (enabled: boolean) => void
  onClose: () => void
}

const deviceLabel = (device: MediaDeviceInfo, index: number) => device.label || `Dispositivo ${index + 1}`

export const AppSettingsScreen = ({ activitySharingEnabled, canHighQualityScreenShare, onActivitySharingChange, onClose }: Props) => {
  const [section, setSection] = useState<Section>('audio')
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [preferences, setPreferences] = useState<DevicePreferences>(getDevicePreferences)
  const [noiseSuppression, setNoiseSuppression] = useState(getNoiseSuppression)
  const [quality, setQuality] = useState<StreamQualityId>(getStreamQuality)
  const [gameOverlay, setGameOverlay] = useState(getGameOverlayEnabled)

  useEffect(() => {
    let active = true
    const load = async () => {
      try { const next = await navigator.mediaDevices.enumerateDevices(); if (active) setDevices(next) } catch { if (active) setDevices([]) }
    }
    void load()
    navigator.mediaDevices?.addEventListener?.('devicechange', load)
    return () => { active = false; navigator.mediaDevices?.removeEventListener?.('devicechange', load) }
  }, [])

  const byKind = useMemo(() => (kind: DeviceKind) => devices.filter((device) => device.kind === kind), [devices])
  const changeDevice = (key: keyof DevicePreferences, value: string) => {
    const next = { ...preferences, [key]: value }
    setPreferences(next)
    saveDevicePreferences(next)
  }
  const changeNoise = (enabled: boolean) => { setNoiseSuppression(enabled); saveNoiseSuppression(enabled) }
  const changeQuality = (next: StreamQualityId) => { setQuality(next); saveStreamQuality(next) }
  const changeOverlay = (enabled: boolean) => { setGameOverlay(enabled); saveGameOverlayEnabled(enabled) }

  const DeviceSelect = ({ kind, label, preference }: { kind: DeviceKind; label: string; preference: keyof DevicePreferences }) => <label className="app-settings__field"><span>{label}</span><select onChange={(event) => changeDevice(preference, event.target.value)} value={preferences[preference]}><option value="">Padrão do sistema</option>{byKind(kind).map((device, index) => <option key={device.deviceId} value={device.deviceId}>{deviceLabel(device, index)}</option>)}</select></label>
  const Toggle = ({ checked, description, label, onChange }: { checked: boolean; description: string; label: string; onChange: (enabled: boolean) => void }) => <label className="app-settings__toggle"><span><strong>{label}</strong><small>{description}</small></span><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" /></label>

  return <main className="app-settings-screen"><header><div><p className="eyebrow">PREFERÊNCIAS DO APP</p><h1>Configurações.</h1><p>Defina os padrões usados sempre que você entrar em uma call.</p></div><button onClick={onClose} type="button"><Icon name="x" /> Fechar</button></header><div className="app-settings__layout"><nav aria-label="Seções das configurações"><button className={section === 'audio' ? 'is-active' : ''} onClick={() => setSection('audio')} type="button"><Icon name="audio" /><span><strong>Áudio</strong><small>Entrada e saídas</small></span></button><button className={section === 'video' ? 'is-active' : ''} onClick={() => setSection('video')} type="button"><Icon name="camera" /><span><strong>Vídeo</strong><small>Câmera padrão</small></span></button><button className={section === 'transmission' ? 'is-active' : ''} onClick={() => setSection('transmission')} type="button"><Icon name="screen" /><span><strong>Transmissão</strong><small>Qualidade e overlay</small></span></button><button className={section === 'privacy' ? 'is-active' : ''} onClick={() => setSection('privacy')} type="button"><Icon name="eye" /><span><strong>Privacidade</strong><small>Atividade visível</small></span></button></nav><section className="app-settings__content">{section === 'audio' && <><div className="app-settings__heading"><span><Icon name="audio" /></span><div><h2>Áudio</h2><p>Escolha os dispositivos que serão usados por padrão nas próximas calls.</p></div></div><div className="app-settings__card"><DeviceSelect kind="audioinput" label="Microfone" preference="inputId" /><DeviceSelect kind="audiooutput" label="Saída de voz" preference="voiceOutputId" /><DeviceSelect kind="audiooutput" label="Saída de compartilhamento" preference="screenOutputId" /><Toggle checked={noiseSuppression} description="Reduz sons constantes do ambiente antes de transmitir sua voz." label="Redução de ruído" onChange={changeNoise} /></div></>}
    {section === 'video' && <><div className="app-settings__heading"><span><Icon name="camera" /></span><div><h2>Vídeo</h2><p>Defina qual câmera o app deve priorizar ao ligar o vídeo.</p></div></div><div className="app-settings__card"><DeviceSelect kind="videoinput" label="Câmera" preference="videoInputId" /><p className="app-settings__note">A câmera só é ativada quando você escolher ligá-la durante a call.</p></div></>}
    {section === 'transmission' && <><div className="app-settings__heading"><span><Icon name="screen" /></span><div><h2>Transmissão</h2><p>Estes valores serão usados como padrão ao compartilhar sua tela.</p></div></div><div className="app-settings__card"><label className="app-settings__field"><span>Qualidade padrão</span><select onChange={(event) => changeQuality(event.target.value as StreamQualityId)} value={canHighQualityScreenShare ? quality : '720p30'}><option value="720p30">720p · 30 FPS</option>{canHighQualityScreenShare && <><option value="1080p30">1080p · 30 FPS</option><option value="1080p60">1080p · 60 FPS</option></>}</select></label>{!canHighQualityScreenShare && <p className="app-settings__note">Seu perfil utiliza o limite de 720p definido para membros.</p>}<Toggle checked={gameOverlay} description="Mostra participantes por cima de jogos em tela cheia compatíveis." label="Overlay durante jogos" onChange={changeOverlay} /></div></>}
    {section === 'privacy' && <><div className="app-settings__heading"><span><Icon name="eye" /></span><div><h2>Privacidade</h2><p>Controle quais informações de contexto aparecem para outras pessoas.</p></div></div><div className="app-settings__card"><Toggle checked={activitySharingEnabled} description="Mantém sua atividade reconhecida visível enquanto o splotys estiver aberto." label="Exibir minhas atividades" onChange={onActivitySharingChange} /><p className="app-settings__note">O app não envia títulos de janelas, caminhos de arquivos nem sua lista completa de processos.</p></div></>}
  </section></div></main>
}
