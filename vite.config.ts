import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // No source maps in the files the public downloads, so the original code isn't handed out
  build: { sourcemap: false },
})
