import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
// Base path:
//   - Dev: '/' (vite serves from root)
//   - Prod (GitHub Pages): '/tyroforecast/' (subdirectory under github.io domain)
// Override via BASE_PATH env var if deploying somewhere else (e.g. custom domain).
const isProd = process.env.NODE_ENV === 'production'
const basePath = process.env.BASE_PATH ?? (isProd ? '/tyroforecast/' : '/')

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
})
