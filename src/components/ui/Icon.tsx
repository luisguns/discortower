import type { SVGProps } from 'react'

export type IconName =
  | 'audio'
  | 'camera'
  | 'chevron'
  | 'copy'
  | 'controls'
  | 'deafen'
  | 'expand'
  | 'leave'
  | 'mic'
  | 'pip'
  | 'screen'
  | 'settings'
  | 'users'
  | 'warning'
  | 'volumeOff'
  | 'x'

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName
}

const paths: Record<IconName, React.ReactNode> = {
  audio: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18 6a8.5 8.5 0 0 1 0 12" />
    </>
  ),
  camera: (
    <>
      <path d="m16 10 4.6-2.7a.9.9 0 0 1 1.4.8v7.8a.9.9 0 0 1-1.4.8L16 14" />
      <rect width="13" height="12" x="3" y="6" rx="2" />
    </>
  ),
  chevron: <path d="m9 18 6-6-6-6" />,
  copy: (
    <>
      <rect width="11" height="11" x="9" y="9" rx="2" />
      <path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" />
    </>
  ),
  controls: (
    <>
      <path d="M4 6h10" />
      <path d="M18 6h2" />
      <circle cx="16" cy="6" r="2" />
      <path d="M4 12h2" />
      <path d="M10 12h10" />
      <circle cx="8" cy="12" r="2" />
      <path d="M4 18h7" />
      <path d="M15 18h5" />
      <circle cx="13" cy="18" r="2" />
    </>
  ),
  deafen: (
    <>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M18 19c0 1.1-.9 2-2 2h-1v-7h3a2 2 0 0 1 2 2v1" />
      <path d="M6 14h3v7H8a2 2 0 0 1-2-2v-5Z" />
      <path d="m4 4 16 16" />
    </>
  ),
  expand: (
    <>
      <path d="M8 3H3v5" />
      <path d="m3 3 6 6" />
      <path d="M16 3h5v5" />
      <path d="m21 3-6 6" />
      <path d="M8 21H3v-5" />
      <path d="m3 21 6-6" />
      <path d="M16 21h5v-5" />
      <path d="m21 21-6-6" />
    </>
  ),
  leave: (
    <>
      <path d="M10 8a6 6 0 0 1 8 0" />
      <path d="M6 10.5c-.9.9-1.5 2-1.8 3.2-.2.8.2 1.6.9 2l2 1.1c.8.4 1.7.1 2.1-.7l.8-1.6a10 10 0 0 1 4 0l.8 1.6c.4.8 1.3 1.1 2.1.7l2-1.1c.7-.4 1.1-1.2.9-2A9.6 9.6 0 0 0 18 10.5" />
    </>
  ),
  mic: (
    <>
      <rect width="8" height="13" x="8" y="3" rx="4" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
      <path d="M8 21h8" />
    </>
  ),
  pip: (
    <>
      <rect width="20" height="16" x="2" y="4" rx="2" />
      <rect width="8" height="6" x="11" y="11" rx="1" />
    </>
  ),
  screen: (
    <>
      <rect width="18" height="13" x="3" y="4" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="m9 10 3-3 3 3" />
      <path d="M12 7v6" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </>
  ),
  warning: (
    <>
      <path d="m21 19-8.3-14.4a.8.8 0 0 0-1.4 0L3 19a.8.8 0 0 0 .7 1.2h16.6A.8.8 0 0 0 21 19Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </>
  ),
  volumeOff: (
    <>
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="m22 9-6 6" />
      <path d="m16 9 6 6" />
    </>
  ),
  x: (
    <>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </>
  ),
}

export const Icon = ({ name, ...props }: IconProps) => (
  <svg
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.8"
    viewBox="0 0 24 24"
    {...props}
  >
    {paths[name]}
  </svg>
)
