import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/tests/setup.ts']
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@epubjs': resolve('src/shared/epubjs/src/index'),
      '@epubjs/*': resolve('src/shared/epubjs/src/*')
    }
  }
})
