import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': process.env.API_TARGET ?? 'http://localhost:8000' },
    // Vite rejects unknown Host headers (DNS-rebinding protection). localhost and LAN IPs pass
    // by default; a tunnel domain does not, and phone testing needs one when the Windows
    // firewall blocks the LAN port. Kept to these two suffixes rather than disabling the check.
    allowedHosts: ['.trycloudflare.com', '.ngrok-free.app'],
  },
})
