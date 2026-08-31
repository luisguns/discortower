import type { LocalProfile, ProfileNameStyle } from '../types'

export const PROFILE_METADATA_VERSION = 2
export const MAX_PROFILE_GIF_BYTES = 300 * 1024
export const MAX_PROFILE_SOURCE_BYTES = 8 * 1024 * 1024
export const MAX_PROFILE_AVATAR_DATA_URL_LENGTH = 430_000

const supportedAvatarTypes = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const isSafeAvatarDataUrl = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= MAX_PROFILE_AVATAR_DATA_URL_LENGTH &&
  /^data:image\/(?:gif|jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(value)

export const DEFAULT_PROFILE_NAME_STYLE: ProfileNameStyle = {
  font: 'mono',
  color: '#DDE5DE',
  effect: 'none',
  weight: 600,
  spacing: 'normal',
  casing: 'normal',
  badge: 'none',
  animation: 'none',
}

export const normalizeProfileNameStyle = (value?: Partial<ProfileNameStyle> | null): ProfileNameStyle => ({
  font: value?.font === 'condensed' || value?.font === 'rounded' || value?.font === 'serif' ? value.font : 'mono',
  color: typeof value?.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color) ? value.color.toUpperCase() : DEFAULT_PROFILE_NAME_STYLE.color,
  effect: value?.effect === 'glow' || value?.effect === 'shadow' || value?.effect === 'outline' ? value.effect : 'none',
  weight: value?.weight === 500 || value?.weight === 700 ? value.weight : 600,
  spacing: value?.spacing === 'tight' || value?.spacing === 'wide' ? value.spacing : 'normal',
  casing: value?.casing === 'uppercase' ? 'uppercase' : 'normal',
  badge: value?.badge === 'soft' || value?.badge === 'outline' || value?.badge === 'pill' ? value.badge : 'none',
  animation: value?.animation === 'breathe' || value?.animation === 'spark' || value?.animation === 'float' ? value.animation : 'none',
})

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    reader.readAsDataURL(blob)
  })

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve(image)
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('A imagem não pôde ser aberta.'))
    }
    image.src = url
  })

const canvasToBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Não foi possível preparar a imagem.')),
      'image/webp',
      quality,
    )
  })

const prepareStaticAvatar = async (file: File) => {
  const image = await loadImage(file)
  const canvas = document.createElement('canvas')
  const size = 256
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Seu navegador não conseguiu preparar a imagem.')

  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight)
  const sourceX = (image.naturalWidth - sourceSize) / 2
  const sourceY = (image.naturalHeight - sourceSize) / 2
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    size,
    size,
  )

  let blob = await canvasToBlob(canvas, 0.86)
  if (blob.size > 120 * 1024) blob = await canvasToBlob(canvas, 0.7)
  if (blob.size > 160 * 1024) {
    throw new Error('Não foi possível reduzir essa imagem. Escolha outra foto.')
  }
  return blobToDataUrl(blob)
}

export const prepareProfileAvatar = async (file: File) => {
  if (!supportedAvatarTypes.has(file.type)) {
    throw new Error('Use uma imagem PNG, JPG, WEBP ou GIF.')
  }
  if (file.size > MAX_PROFILE_SOURCE_BYTES) {
    throw new Error('A imagem original pode ter no máximo 8 MB.')
  }

  if (file.type === 'image/gif') {
    if (file.size > MAX_PROFILE_GIF_BYTES) {
      throw new Error('O GIF de perfil pode ter no máximo 300 KB para continuar animado.')
    }
    const dataUrl = await blobToDataUrl(file)
    if (!isSafeAvatarDataUrl(dataUrl)) throw new Error('Esse GIF não pôde ser usado.')
    return dataUrl
  }

  const dataUrl = await prepareStaticAvatar(file)
  if (!isSafeAvatarDataUrl(dataUrl)) throw new Error('Essa imagem não pôde ser usada.')
  return dataUrl
}

export const serializeParticipantProfile = (profile: LocalProfile) =>
  JSON.stringify({
    fordKallProfile: {
      version: PROFILE_METADATA_VERSION,
      avatarDataUrl: isSafeAvatarDataUrl(profile.avatarDataUrl)
        ? profile.avatarDataUrl
        : undefined,
      nameStyle: normalizeProfileNameStyle(profile.nameStyle),
    },
  })

const profileFromMetadata = (metadata?: string) => {
  if (!metadata) return undefined
  try {
    const parsed: unknown = JSON.parse(metadata)
    if (!parsed || typeof parsed !== 'object') return undefined
    const profile = (parsed as {
      fordKallProfile?: { version?: unknown; avatarDataUrl?: unknown; nameStyle?: Partial<ProfileNameStyle> }
    }).fordKallProfile
    if (profile?.version !== 1 && profile?.version !== PROFILE_METADATA_VERSION) return undefined
    return profile
  } catch {
    return undefined
  }
}

export const participantAvatarFromMetadata = (metadata?: string) => {
  const profile = profileFromMetadata(metadata)
  return isSafeAvatarDataUrl(profile?.avatarDataUrl) ? profile.avatarDataUrl : undefined
}

export const participantNameStyleFromMetadata = (metadata?: string) => {
  const profile = profileFromMetadata(metadata)
  return profile?.version === PROFILE_METADATA_VERSION
    ? normalizeProfileNameStyle(profile.nameStyle)
    : DEFAULT_PROFILE_NAME_STYLE
}

