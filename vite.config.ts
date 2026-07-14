import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.endsWith("/src/lib/i18n/resources.ts")) {
            return "i18n-resources"
          }
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
      "/gateway": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
      "/events": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
})
