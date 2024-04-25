import path from 'path'
import express from 'express'
import { app as electronApp } from 'electron'

const app = express()

const PORT = 3495

// Directory containing the files you want to serve
const publicDirectoryPath = path.join(electronApp.getPath('appData'), 'public') // Crea

app.use(express.static(publicDirectoryPath))

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
