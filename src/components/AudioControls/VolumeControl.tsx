import { Icon } from '../ui/Icon'

interface VolumeControlProps {
  label: string
  value: number
  disabled?: boolean
  onChange: (value: number) => void
}

export const VolumeControl = ({ label, value, disabled, onChange }: VolumeControlProps) => {
  const percentage = Math.round(value * 100)

  return (
    <div className="volume-control">
      <Icon name="audio" />
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
      <span>{percentage}%</span>
    </div>
  )
}
