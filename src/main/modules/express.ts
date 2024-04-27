import path from 'path'
import express from 'express'
import serveIndex from 'serve-index'
import serveStatic from 'serve-static'
import { app as electronApp } from 'electron'
import cors from 'cors'

const app = express()

export const PORT = 3495

// Directory containing the files you want to serve
const publicDirectoryPath = path.join(electronApp.getPath('appData'), 'public') // Crea

app.use(cors())
app.use(serveStatic(publicDirectoryPath))
app.use(serveIndex(publicDirectoryPath))
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
