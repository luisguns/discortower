import { Icon } from '../ui/Icon'

interface VolumeControlProps {
  label: string
  value: number
  disabled?: boolean
  muted?: boolean
  onMuteToggle?: () => void
  onChange: (value: number) => void
}

export const VolumeControl = ({
  label,
  value,
  disabled,
  muted = false,
  onMuteToggle,
  onChange,
}: VolumeControlProps) => {
  const percentage = Math.round(value * 100)

  return (
    <div className={`volume-control ${muted ? 'volume-control--muted' : ''}`}>
      {onMuteToggle ? (
        <button
          aria-label={muted ? `${label}: reativar áudio` : `${label}: silenciar`}
          className="volume-control__mute"
          disabled={disabled}
          onClick={onMuteToggle}
          title={muted ? 'Reativar áudio' : 'Silenciar apenas para mim'}
          type="button"
        >
          <Icon name={muted ? 'volumeOff' : 'audio'} />
        </button>
      ) : (
        <Icon name={muted ? 'volumeOff' : 'audio'} />
      )}
      <input
        aria-label={label}
        disabled={disabled}
        max="100"
        min="0"
        onChange={(event) => onChange(Number(event.target.value) / 100)}
        style={{ '--volume': `${percentage}%` } as React.CSSProperties}
        type="range"
        value={percentage}
      />
      <span>{muted ? 'Mudo' : `${percentage}%`}</span>
    </div>
  )
}
