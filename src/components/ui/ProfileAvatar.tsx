const initialsFor = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?'

export const ProfileAvatar = ({
  avatarDataUrl,
  className = '',
  name,
}: {
  avatarDataUrl?: string
  className?: string
  name: string
}) => (
  <span className={`profile-avatar ${className}`.trim()}>
    {avatarDataUrl ? (
      <img alt={`Avatar de ${name}`} draggable={false} src={avatarDataUrl} />
    ) : (
      <span aria-hidden="true">{initialsFor(name)}</span>
    )}
  </span>
)

