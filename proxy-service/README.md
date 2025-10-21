# OpenAI TTS Proxy Service

A containerized proxy service that forwards requests to OpenAI's Text-to-Speech API with security, rate limiting, and CORS support. Built with TypeScript and Bun for optimal performance, with nginx as a reverse proxy for enhanced reliability and performance.

## Features

- 🔒 **Security**: Helmet.js for security headers, rate limiting, and CORS protection
- 🚀 **Performance**: Bun runtime with TypeScript for optimal speed and type safety
- 🐳 **Containerized**: Docker support with health checks and graceful shutdown
- 📊 **Monitoring**: Request logging and health check endpoints
- 🔄 **Reliability**: Automatic restart policies and error handling
- 🔐 **Secrets**: Docker secrets for secure API key management
- 🌐 **Nginx Reverse Proxy**: High-performance load balancing and request routing
- ⚡ **Optimized**: Gzip compression, connection pooling, and caching

## Quick Start

### Using Docker Compose

1. Create the Docker secret:

   ```bash
   ./setup-secrets.sh
   ```

2. Start the service:

   ```bash
   docker-compose up -d
   ```

### Using Docker Stack

1. Create the Docker secret:

   ```bash
   ./setup-secrets.sh
   ```

2. Build the image:

   ```bash
   docker build -t openai-tts-proxy:latest .
   ```

3. Deploy the stack:

   ```bash
   docker stack deploy -c docker-compose.yml openai-tts-stack
   ```

## API Endpoints

### Nginx Health Check

- **GET** `/nginx-health` - Nginx service health status

### Service Health Check

- **GET** `/health` - Proxy service health status (routed through nginx)

### OpenAI TTS Proxy

- **POST** `/api/openai/v1/audio/speech` - Text-to-speech conversion
- **GET** `/api/openai/v1/models` - List available models

All requests to `/api/openai/*` are proxied to `https://api.openai.com/*`

### Access Points

- **Primary**: `http://localhost` (nginx reverse proxy on port 80)
- **Direct**: `http://localhost:5458` (direct access to proxy service)

## Environment Variables

| Variable          | Description                             | Default    |
| ----------------- | --------------------------------------- | ---------- |
| `OPENAI_API_KEY`  | Your OpenAI API key (via Docker secret) | Required   |
| `PORT`            | Server port                             | 3001       |
| `NODE_ENV`        | Environment                             | production |
| `ALLOWED_ORIGINS` | CORS allowed origins (comma-separated)  | \*         |
| `RATE_LIMIT_MAX`  | Max requests per IP per 15min           | 100        |

## Docker Secrets

The service uses Docker secrets for secure API key management:

- **Secret Name**: `openai_api_key`
- **Secret File**: `/run/secrets/openai_api_key` (inside container)
- **Fallback**: Environment variable `OPENAI_API_KEY`

## Usage Example

```javascript
// Make a TTS request through the nginx proxy (recommended)
const response = await fetch('http://localhost/api/openai/v1/audio/speech', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'tts-1',
    input: 'Hello, world!',
    voice: 'alloy',
    response_format: 'mp3'
  })
})

const audioBlob = await response.blob()
```

### Alternative: Direct Access

```javascript
// Direct access to proxy service (bypasses nginx)
const response = await fetch('http://localhost:5458/api/openai/v1/audio/speech', {
  // ... same configuration
})
```

## Docker Commands

### Build and Run

```bash
# Build the image
docker build -t openai-tts-proxy .

# Run the container
docker run -d \
  --name openai-tts-proxy \
  -p 3001:3001 \
  -e OPENAI_API_KEY=your_key_here \
  openai-tts-proxy
```

### Docker Stack Commands

```bash
# Create secret first
./setup-secrets.sh

# Deploy stack
docker stack deploy -c docker-compose.yml openai-tts-stack

# Check stack status
docker stack services openai-tts-stack

# Remove stack
docker stack rm openai-tts-stack

# Remove secret
docker secret rm openai_api_key
```

## Nginx Configuration

The nginx service provides:

- **Selective Routing**: Only routes specific requests to the proxy service
- **Load Balancing**: Upstream configuration with connection pooling
- **Rate Limiting**: Built-in rate limiting (10 requests/second per IP)
- **Compression**: Gzip compression for better performance
- **Health Checks**: Built-in health monitoring for both nginx and proxy service
- **Error Handling**: Automatic failover and retry logic
- **Security**: Request buffering and timeout management
- **404 Handling**: Returns proper 404 responses for unmatched routes

### Nginx Features

- **Upstream**: `openai_proxy` upstream pointing to the proxy service
- **Rate Limiting**: Zone-based rate limiting with burst handling
- **Compression**: Gzip compression for text-based responses
- **Health Checks**: `/nginx-health` endpoint for monitoring
- **Proxy Settings**: Optimized proxy configuration with proper headers

## Security Features

- **Rate Limiting**: Prevents abuse with configurable request limits (both nginx and application level)
- **CORS Protection**: Configurable origin restrictions
- **Security Headers**: Helmet.js for security best practices
- **Non-root User**: Container runs as non-privileged user
- **Health Checks**: Built-in health monitoring for all services
- **Request Buffering**: Nginx request buffering for better performance

## Monitoring

The service includes:

- Request logging with Morgan
- Health check endpoint at `/health`
- Graceful shutdown handling
- Error logging and handling

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Run in production mode
bun run start

# Build for production
bun run build
```

## License

MIT
