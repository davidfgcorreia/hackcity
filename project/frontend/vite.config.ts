import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': process.env.API_TARGET ?? 'http://localhost:8000',
      '/analytics': process.env.ANALYTICS_TARGET ?? 'http://localhost:8100',
    },
  },
})
