import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/appmydramatv-IOS/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
  },
})