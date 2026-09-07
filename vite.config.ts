import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
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
