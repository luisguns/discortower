const packageJson = require('./package.json')

const config = structuredClone(packageJson.build)
const signingRequired = process.env.WINDOWS_SIGNING_REQUIRED === 'true'
const signingEnvironmentNames = [
  'AZURE_SIGNING_ENDPOINT',
  'AZURE_CODE_SIGNING_ACCOUNT_NAME',
  'AZURE_CERTIFICATE_PROFILE_NAME',
  'AZURE_PUBLISHER_NAME',
  'AZURE_TENANT_ID',
  'AZURE_CLIENT_ID',
  'AZURE_CLIENT_SECRET',
]
const missingSigningValues = signingEnvironmentNames.filter((name) => !process.env[name])

if (signingRequired && missingSigningValues.length) {
  throw new Error(`A release do Windows exige Artifact Signing. Configure: ${missingSigningValues.join(', ')}`)
}

if (!missingSigningValues.length) {
  config.win = {
    ...config.win,
    forceCodeSigning: true,
    azureSignOptions: {
      endpoint: process.env.AZURE_SIGNING_ENDPOINT,
      codeSigningAccountName: process.env.AZURE_CODE_SIGNING_ACCOUNT_NAME,
      certificateProfileName: process.env.AZURE_CERTIFICATE_PROFILE_NAME,
      publisherName: process.env.AZURE_PUBLISHER_NAME,
    },
  }
}

// Identity already reserved in Partner Center for the Store submission.
// The Store signs the submitted MSIX; these values must match its package identity exactly.
config.appx = {
  ...config.appx,
  identityName: 'GunnsDev.splotys',
  publisher: 'CN=22879DE7-5B1B-400E-B9D0-AC6A48145396',
  publisherDisplayName: 'Gunns Dev',
  displayName: 'splotys',
  // Keep the Store application identity stable across package updates.
  applicationId: 'DiscorTower',
  artifactName: 'splotys-Store-${version}-${arch}.${ext}',
  languages: ['pt-BR', 'en-US'],
  capabilities: ['microphone', 'webcam', 'privateNetworkClientServer'],
}

module.exports = config
