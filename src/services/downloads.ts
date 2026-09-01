export const WINDOWS_LTS_DOWNLOAD_URL = '/download.html'
const WINDOWS_LTS_API_URL = 'https://api.github.com/repos/luisguns/discortower/releases/latest'

interface GitHubReleaseAsset {
  name?: string
  browser_download_url?: string
}

export const downloadWindowsLts = async () => {
  try {
    const response = await fetch(WINDOWS_LTS_API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!response.ok) throw new Error('Release unavailable')
    const release = await response.json() as { assets?: GitHubReleaseAsset[] }
    const assets = release.assets ?? []
    const installer = assets.find((asset) => asset.name === 'splotys-LTS-Windows-x64.exe')
      ?? assets.find((asset) => /^splotys-Setup-[\w.-]+-x64\.exe$/i.test(asset.name ?? ''))
      ?? assets.find((asset) => /^DiscorTower-Setup-[\w.-]+-x64\.exe$/i.test(asset.name ?? ''))
    if (!installer?.browser_download_url) throw new Error('Installer unavailable')
    window.location.assign(installer.browser_download_url)
  } catch {
    window.location.assign(WINDOWS_LTS_DOWNLOAD_URL)
  }
}
