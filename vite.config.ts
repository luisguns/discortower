import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const appVersion = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

export default defineConfig({
  plugins: [react()],
  base: './',
  define: {
    __SPLOTYS_VERSION__: JSON.stringify(appVersion.version),
  },
  server: {
    proxy: {
      '/supabase': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/supabase/, ''),
      },
      '/tower': {
        target: 'http://127.0.0.1:7882',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/tower/, ''),
      },
    },
  },
})
