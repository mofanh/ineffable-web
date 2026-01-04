import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // WebSocket 代理（用于终端）- 必须在 /api 之前定义
      '/api/agents/': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
        ws: true,  // 启用 WebSocket 代理
      },
      '/api/terminal': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
        ws: true,  // 启用 WebSocket 代理
      },
      // proxy API calls to backend running on Hub (port 8080)
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
