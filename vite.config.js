import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: '/dockflow-mvp/',
  server: {
    host: '0.0.0.0',
    port: 5175,
    strictPort: true
  },
  test: {
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    restoreMocks: true,
    include: ['tests/**/*.component.test.jsx'],
  }
})