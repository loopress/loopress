import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Loopress serves the app from wp-content/loopress/apps/<name>/, so every asset URL the
  // build bakes in (imported images, chunk paths, import.meta.env.BASE_URL) must carry that
  // prefix, not "/".
  base: '/wp-content/loopress/apps/search/',
  plugins: [react()],
})
