import { useEffect } from 'react'
import type { useAudioDevices } from '../../hooks/useAudioDevices'
import type { useMicrophoneProcessing } from '../../hooks/useMicrophoneProcessing'
import { streamQualityPresets } from '../../services/livekit'
import type { StreamQualityId } from '../../types'
import { Icon } from '../ui/Icon'

type AudioDevicesState = ReturnType<typeof useAudioDevices>
type MicrophoneProcessingState = ReturnType<typeof useMicrophoneProcessing>

interface SettingsModalProps {
  devices: AudioDevicesState
  microphoneProcessing: MicrophoneProcessingState
  quality: StreamQualityId
  onQualityChange: (quality: StreamQualityId) => void
  onClose: () => void
}

const deviceName = (device: MediaDeviceInfo, index: number, fallback: string) =>
  device.label || `${fallback} ${index + 1}`

export const SettingsModal = ({
  devices,
  microphoneProcessing,
  quality,
  onQualityChange,
  onClose,
}: SettingsModalProps) => {
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <section
        aria-labelledby="settings-title"
        aria-modal="true"
        className="settings-modal"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="settings-modal__header">
          <div>
            <p className="eyebrow">BOX</p>
            <h2 id="settings-title">Áudio e transmissão</h2>
          </div>
          <button
            aria-label="Fechar configurações"
            className="icon-button"
            onClick={onClose}
            type="button"
          >
            <Icon name="x" />
          </button>
        </header>

        <div className="settings-section">
          <div className="settings-section__heading">
            <span>01</span>
            <div>
              <h3>Microfone</h3>
              <p>Dispositivo usado para sua voz.</p>
            </div>
          </div>
          <label className="select-field">
            <span>Entrada de voz</span>
            <select
              disabled={devices.loading || devices.inputs.length === 0}
              onChange={(event) => void devices.switchInput(event.target.value)}
              value={devices.selectedInput}
            >
              {!devices.selectedInput && <option value="">Padrão do sistema</option>}
              {devices.inputs.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {deviceName(device, index, 'Microfone')}
                </option>
              ))}
            </select>
          </label>
          <label className={`setting-switch ${!microphoneProcessing.supported ? 'is-disabled' : ''}`}>
            <span>
              <strong>Supressão de ruído</strong>
              <small>Filtro WebRTC local para ventoinha, teclado e ruído contínuo.</small>
            </span>
            <input
              checked={microphoneProcessing.noiseSuppression}
              disabled={!microphoneProcessing.supported || microphoneProcessing.busy}
              onChange={(event) => void microphoneProcessing.setEnabled(event.target.checked)}
              type="checkbox"
            />
            <i aria-hidden="true" />
          </label>
          {!microphoneProcessing.supported && (
            <div className="settings-note"><Icon name="warning" />Este navegador não expõe supressão de ruído configurável.</div>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-section__heading">
            <span>02</span>
            <div>
              <h3>Saídas independentes</h3>
              <p>Envie vozes e transmissões para dispositivos diferentes.</p>
            </div>
          </div>
          {devices.outputSelectionSupported ? (
            <div className="settings-grid">
              <label className="select-field">
                <span>Saída de voz</span>
                <select
                  onChange={(event) => devices.setVoiceOutput(event.target.value)}
                  value={devices.preferences.voiceOutputId}
                >
                  <option value="">Padrão do sistema</option>
                  {devices.outputs.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {deviceName(device, index, 'Saída')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="select-field">
                <span>Saída da transmissão</span>
                <select
                  onChange={(event) => devices.setScreenOutput(event.target.value)}
                  value={devices.preferences.screenOutputId}
                >
                  <option value="">Padrão do sistema</option>
                  {devices.outputs.map((device, index) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {deviceName(device, index, 'Saída')}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="settings-note">
              <Icon name="warning" />
              Este navegador não permite escolher a saída de áudio. O dispositivo padrão será usado.
            </div>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-section__heading">
            <span>03</span>
            <div>
              <h3>Qualidade da transmissão</h3>
              <p>A configuração será aplicada na próxima transmissão.</p>
            </div>
          </div>
          <div className="quality-options">
            {(Object.keys(streamQualityPresets) as StreamQualityId[]).map((qualityId) => (
              <button
                className={quality === qualityId ? 'is-active' : ''}
                key={qualityId}
                onClick={() => onQualityChange(qualityId)}
                type="button"
              >
                <span>{streamQualityPresets[qualityId].shortLabel}</span>
                {streamQualityPresets[qualityId].label}
                <small>{streamQualityPresets[qualityId].usageLabel}</small>
              </button>
            ))}
          </div>
          <div className="settings-note settings-note--quality">
            <Icon name="warning" />
            Resolução, FPS, câmeras e quantidade de espectadores aumentam o uso de dados do LiveKit. Use 720p30 para preservar a franquia gratuita.
          </div>
        </div>

        {(devices.error || microphoneProcessing.error) && (
          <div className="inline-error">{devices.error || microphoneProcessing.error}</div>
        )}
      </section>
    </div>
  )
}
