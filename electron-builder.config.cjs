const packageJson = require('./package.json')

const config = structuredClone(packageJson.build)

// Identity already reserved in Partner Center for the Store submission.
// The Store signs the submitted MSIX; these values must match its package identity exactly.
config.appx = {
  ...config.appx,
  identityName: 'GunnsDev.splotys',
  publisher: 'CN=22879DE7-5B1B-400E-B9D0-AC6A48145396',
  publisherDisplayName: 'Gunns Dev',
  displayName: 'splotys',
  backgroundColor: '#151427',
  // Keep the Store application identity stable across package updates.
  applicationId: 'DiscorTower',
  artifactName: 'splotys-Store-${version}-${arch}.${ext}',
  languages: ['pt-BR', 'en-US'],
  capabilities: ['microphone', 'webcam', 'privateNetworkClientServer'],
}

module.exports = config
