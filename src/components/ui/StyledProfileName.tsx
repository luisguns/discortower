import { normalizeProfileNameStyle } from '../../services/profile'
import type { ProfileNameStyle } from '../../types'
import type { CSSProperties, ReactNode } from 'react'

interface Props {
  children: ReactNode
  className?: string
  style?: ProfileNameStyle
}

export const StyledProfileName = ({ children, className = '', style }: Props) => {
  const value = normalizeProfileNameStyle(style)
  return <span
    className={`profile-name profile-name--font-${value.font} profile-name--effect-${value.effect} profile-name--spacing-${value.spacing} profile-name--case-${value.casing} profile-name--badge-${value.badge} profile-name--animation-${value.animation} ${className}`.trim()}
    style={{ '--profile-name-color': value.color, '--profile-name-weight': value.weight } as CSSProperties}
  >{children}</span>
}
