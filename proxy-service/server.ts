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
app.post('/api/openai/v1/audio/speech', async (req: Request, res: Response) => {
  try {
    // Validate and fix the request body
    const { model, input, voice, ...otherParams } = req.body

    // Validate required fields
    if (!input) {
      return res.status(400).json({
        error: 'Missing required field',
        message: 'The "input" field is required'
      })
    }

    // Fix model name if it's incorrect
    let correctedModel = model
    if (model === 'gpt-4o-mini-tts' || !model) {
      correctedModel = 'tts-1' // Default to tts-1
    }

    // Validate voice parameter
    const validVoices = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']
    const correctedVoice = voice && validVoices.includes(voice) ? voice : 'alloy'

    // Prepare the corrected request body
    const correctedBody = {
      model: correctedModel,
      input,
      voice: correctedVoice,
      ...otherParams
    }

    console.log('Proxying TTS request:', {
      originalModel: model,
      correctedModel,
      voice: correctedVoice,
      inputLength: input?.length
    })

    const response = await axiosInstance.post('/v1/audio/speech', correctedBody, {
      responseType: 'stream'
    })

    // Forward headers from upstream response
    if (response.headers['content-type']) {
      res.setHeader('Content-Type', response.headers['content-type'])
    }
    if (response.headers['content-length']) {
      res.setHeader('Content-Length', response.headers['content-length'])
    }

    // Set a timeout for the response
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        console.error('Request timeout')
        res.status(408).json({ error: 'Request timeout' })
      }
    }, 60000) // 60 second timeout

    // Handle stream events properly
    response.data.on('error', (streamError: Error) => {
      console.error('Stream error:', streamError)
      clearTimeout(timeout)
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream error occurred' })
      }
    })

    response.data.on('end', () => {
      console.log('Stream ended successfully')
      clearTimeout(timeout)
    })

    // Handle client disconnect
    req.on('close', () => {
      console.log('Client disconnected')
      clearTimeout(timeout)
      response.data.destroy()
    })

    // Pipe the stream to response
    response.data.pipe(res, { end: true })
  } catch (error) {
    if (error instanceof AxiosError) {
      console.error('Error proxying request to OpenAI:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data
      })
      res.status(error.response?.status || 500).json({
        error: 'TTS generation failed',
        message: error.response?.data?.error?.message || error.message
      })
    } else {
      console.error('Error proxying request to OpenAI:', error)
      res.status(500).json({
        error: 'TTS generation failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  }
})

// Error handling middleware
app.use((err: Error, req: Request, res: Response) => {
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
