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
    optimizeDeps: {
      include: ['@mui/material/styles', '@mui/material', '@mui/icons-material']
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: undefined // Better tree-shaking
        }
      },
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          dead_code: true,
          unused: true
        },
        mangle: {
          toplevel: true
        }
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
