# Use official Bun runtime as base image
FROM oven/bun:1-alpine

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S bunuser && \
    adduser -S bunuser -u 1001

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile --production

# Copy application code
COPY server.ts ./
COPY tsconfig.json ./

# Change ownership to non-root user
RUN chown -R bunuser:bunuser /app
USER bunuser

# Expose port
EXPOSE 5458

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD bun -e "Bun.fetch('http://localhost:5458/health').then(r => process.exit(r.status === 200 ? 0 : 1))"

# Start the application
CMD ["bun", "run", "server.ts"]
