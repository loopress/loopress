import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base: every bundler-managed asset (chunks, imported images, CSS url()) resolves
  // against the file's real served URL via import.meta.url, so one build works on every
  // Loopress environment without knowing wp-content's path.
  base: './',
  plugins: [react()],
})
