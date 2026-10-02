import { defineConfig } from 'vite'

export default defineConfig({
  base: '/dockflow-mvp/',
  server: {
    host: 'localhost',
    port: 5175,
    strictPort: true
  }
})