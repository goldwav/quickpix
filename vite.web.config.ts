import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

/**
 * Browser-only dev server (`npm run dev:web`). Runs the renderer with the
 * dev mock (generated sample photos) — no Electron needed. Handy for UI and
 * shader work, and for contributors without a Windows box.
 */
export default defineConfig({
  root: 'src/renderer',
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer/src'),
      '@shared': resolve(__dirname, 'src/shared')
    }
  },
  server: {
    port: 5174
  }
})
