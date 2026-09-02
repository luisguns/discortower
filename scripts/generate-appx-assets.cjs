const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')

const root = path.resolve(__dirname, '..')
const source = path.join(root, 'build', 'icon.png')
const destination = path.join(root, 'build', 'appx')
const dark = '#151427'

const writeSquare = async (fileName, size) => sharp(source)
  .resize(size, size, { fit: 'cover' })
  .png()
  .toFile(path.join(destination, fileName))

const writeWide = async () => {
  const label = Buffer.from(`
    <svg width="310" height="150" xmlns="http://www.w3.org/2000/svg">
      <rect width="310" height="150" fill="${dark}"/>
      <text x="170" y="84" fill="#fff7fa" font-family="Segoe UI, Arial, sans-serif" font-size="31" font-weight="700" letter-spacing="1">SPLOTYS</text>
      <rect x="170" y="98" width="99" height="4" rx="2" fill="#ff6b8a"/>
    </svg>
  `)

  return sharp(label)
    .composite([{ input: await sharp(source).resize(122, 122).png().toBuffer(), left: 18, top: 14 }])
    .png()
    .toFile(path.join(destination, 'Wide310x150Logo.png'))
}

const main = async () => {
  await fs.mkdir(destination, { recursive: true })
  await Promise.all([
    writeSquare('StoreLogo.png', 50),
    writeSquare('Square44x44Logo.png', 44),
    writeSquare('Square150x150Logo.png', 150),
    writeWide(),
  ])
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
