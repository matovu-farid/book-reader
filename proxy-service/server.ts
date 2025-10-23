import express from 'express'
import type { Request, Response } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { readFileSync } from 'fs'
import OpenAI from 'openai'

const app = express()
const PORT = parseInt(process.env.PORT || '5458', 10)

const OPENAI_API_KEY_FILE = process.env.OPENAI_API_KEY_FILE || '/run/secrets/openai_api_key'
// At the top of the file, after imports

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || readFileSync(OPENAI_API_KEY_FILE, 'utf8').trim() || ''
})

// Security middleware
app.use(helmet())

// JSON parsing middleware
app.use(express.json())

// CORS configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true
  })
)

// Logging
app.use(morgan('combined'))

// // Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'openai-tts-proxy'
  })
})

// Proxy all requests to /api/openai/* to OpenAI API
// app.use('/api/openai', createProxyMiddleware(openaiProxyOptions))

app.post('/api/openai/v1/audio/speech', async (req, res) => {
  // Validate and fix the request body
  const { model, input, voice, ...otherParams } = req.body
  const response = await openai.audio.speech.create({
    model,
    input,
    voice,
    ...otherParams
  })
  const buffer = Buffer.from(await response.arrayBuffer())
  res.setHeader('Content-Type', 'audio/mpeg')
  res.setHeader('Content-Length', buffer.length.toString())
  res.send(buffer)
})

// Error handling middleware

app.use((err: Error, req: Request, res: Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err)
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  })
})

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.originalUrl} not found`
  })
})

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`OpenAI TTS Proxy server running on port ${PORT}`)
  console.log(`Health check available at http://localhost:${PORT}`)
  console.log(`OpenAI API proxy available at http://localhost:${PORT}/api/openai`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully')
  process.exit(0)
})
