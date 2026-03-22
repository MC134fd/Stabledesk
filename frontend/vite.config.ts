import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:3000',
      '/state': 'http://localhost:3000',
      '/payments': 'http://localhost:3000',
      '/lending': 'http://localhost:3000',
      '/audit': 'http://localhost:3000',
      '/health': 'http://localhost:3000',
      '/settings': 'http://localhost:3000',
      '/execute': 'http://localhost:3000',
      '/stablecoins': 'http://localhost:3000',
    },
  },
})
