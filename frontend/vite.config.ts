import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Dev-only convenience: makes /api same-origin from the browser's
      // perspective, avoiding CORS during local development. Production
      // deployment (frontend and backend on different real origins) uses
      // VITE_API_URL instead — see src/lib/api.ts. Backend port matches
      // src/server.ts's default (process.env.PORT ?? 3000).
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
