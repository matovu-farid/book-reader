import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
        '@epubjs$': resolve('src/renderer/src/epubjs/src/index.js'),
        '@epubjs': resolve('src/renderer/src/epubjs/src'),
        epubjs: resolve('src/renderer/src/epubjs/src')
      }
    },
    plugins: [
      react({
        babel: {
          plugins: [['babel-plugin-react-compiler']]
        }
      }),
      TanStackRouterVite()
    ]
  }
})
