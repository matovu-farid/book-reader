import path from 'path'
import express from 'express'
import serveIndex from 'serve-index'
import serveStatic from 'serve-static'
import { app as electronApp } from 'electron'
import cors from 'cors'
import { PORT } from './PORT'

const app = express()

// Directory containing the files you want to serve
const publicDirectoryPath = () => path.join(electronApp.getPath('appData'), 'public') // Crea

app.use(cors())

// Add logging middleware
app.use((req, _res, next) => {
  console.log(`Express: ${req.method} ${req.url}`)
  next()
})

// Test endpoint to verify server is working
app.get('/test', (_req, res) => {
  res.json({
    message: 'Express server is running',
    publicDir: publicDirectoryPath(),
    timestamp: new Date().toISOString()
  })
})

app.use(serveStatic(publicDirectoryPath()))
app.use(serveIndex(publicDirectoryPath()))
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log(`Serving files from: ${publicDirectoryPath()}`)
})
