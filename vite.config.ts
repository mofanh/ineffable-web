import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // proxy API calls to backend running on 127.0.0.1:8080
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
        // SSE uses plain HTTP streaming; do not enable websocket proxy for this path
        ws: false,
      },
    },
  },
})
