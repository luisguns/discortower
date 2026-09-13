// Run only against the isolated benchmark sidecar; never uses production secrets.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { AccessToken } from '../../control-tower/packages/server-sdk/dist/index.js'
const require = createRequire(new URL('../../control-tower/package.json', import.meta.url))
const { build } = require('esbuild')
const cfg = JSON.parse(await readFile(new URL('../../control-tower/scripts/benchmark/.runtime/config.json', import.meta.url)))
if (cfg.apiKey !== 'benchmark-only') throw new Error('Isolated benchmark config required')
const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  if (req.url === '/') {
    res.setHeader('Content-Type', 'text/html')
    res.end('<!doctype html><title>RTC repeat regression</title><button>Run synthetic repeat test</button><pre></pre><script type="module" src="/test.js"></script>')
  } else if (req.url === '/test.js') {
    const bundle = await build({ entryPoints: ['tests/rtc-repeat-browser.mjs'], bundle: true, format: 'esm', write: false,
      define: { 'import.meta.env': '{}' },
    })
    res.setHeader('Content-Type', 'text/javascript')
    res.end(bundle.outputFiles[0].text)
  } else if (req.url === '/fixture') {
    const room = `repeat-${randomUUID()}`
    const tokens = await Promise.all([0, 1, 2].map(async i => {
      const token = new AccessToken(cfg.apiKey, cfg.apiSecret, { identity: `synthetic-${i}`, ttl: 300 })
      token.addGrant({ roomJoin: true, room, canPublish: true, canSubscribe: true, canPublishData: false,
        canPublishSources: ['microphone', 'screen_share', 'screen_share_audio'],
      })
      return token.toJwt()
    }))
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ url: `ws://127.0.0.1:${cfg.port}`, tokens }))
  } else { res.statusCode = 404; res.end() }
})
server.listen(5181, '127.0.0.1', () => console.log('Synthetic repeat test: http://127.0.0.1:5181'))
