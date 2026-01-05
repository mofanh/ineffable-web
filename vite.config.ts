import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // WebSocket 代理（用于终端）- 必须在 /api 之前定义
      '/api/terminal': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
        ws: true,  // 启用 WebSocket 代理
      },
      // Agent API 代理 - 重写路径 /api/agents/{id}/* -> /api/*
      // 当前是单 agent 模式，所以忽略 agent_id
      '/api/agents/': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
        ws: true,  // 支持 WebSocket
        rewrite: (path) => {
          // /api/agents/{id}/execute -> /api/execute
          // /api/agents/{id}/reset -> /api/reset
          const match = path.match(/^\/api\/agents\/[^/]+(\/.*)$/);
          if (match) {
            return '/api' + match[1];
          }
          return path;
        },
      },
      // proxy API calls to backend running on CLI serve (port 8080)
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
