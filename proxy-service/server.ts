import express from 'express'
import type { Request, Response } from 'express'
import { createProxyMiddleware } from 'http-proxy-middleware'
import cors from 'cors'
import rateLimit from 'express-rate-limit'
import helmet from 'helmet'
import morgan from 'morgan'
import { readFileSync } from 'fs'

const app = express()
const PORT = parseInt(process.env.PORT || '5458', 10)

const OPENAI_API_KEY_FILE = process.env.OPENAI_API_KEY_FILE || '/run/secrets/openai_api_key'

// Security middleware
app.use(helmet())

// CORS configuration
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    credentials: true
  })
)

// Logging
app.use(morgan('combined'))

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10), // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
})
app.use(limiter)

// // Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'openai-tts-proxy'
  })
})

// OpenAI TTS proxy configuration
const openaiProxyOptions = {
  target: 'https://api.openai.com',
  changeOrigin: true,
  pathRewrite: {
    '^/api/openai': '' // remove /api/openai prefix when forwarding to OpenAI
  },
  onProxyReq: (
    proxyReq: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    req: Request,
    res: Response
  ) => {
    // Read OpenAI API key from Docker secret or environment
    let apiKey = process.env.OPENAI_API_KEY
    try {
      if (!apiKey) {
        // Try to read from Docker secret first
        apiKey = readFileSync(OPENAI_API_KEY_FILE, 'utf8').trim()
      }
    } catch {
      // Fallback to environment variable
    }

    if (!apiKey) {
      console.error('OpenAI API key not found in secrets or environment')
      return res.status(500).json({ error: 'OpenAI API key not configured' })
    }

    proxyReq.setHeader('Authorization', `Bearer ${apiKey}`)
    proxyReq.setHeader('Content-Type', 'application/json')

    console.log(`Proxying ${req.method} ${req.url} to OpenAI`)
  },
  onProxyRes: (
    proxyRes: any, // eslint-disable-line @typescript-eslint/no-explicit-any
    req: Request,
    res: Response
  ) => {
    console.log(`OpenAI responded with status: ${proxyRes.statusCode}`)

    // Add CORS headers to response only for non-streaming responses
    if (proxyRes.headers['content-type'] !== 'audio/mpeg') {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }
  },
  onError: (err: Error, req: Request, res: Response) => {
    console.error('Proxy error:', err)
    res.status(500).json({
      error: 'Proxy error occurred',
      message: err.message
    })
  }
}

// Proxy all requests to /api/openai/* to OpenAI API
app.use('/api/openai', createProxyMiddleware(openaiProxyOptions))

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
