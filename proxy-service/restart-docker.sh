#!/bin/bash

# Script to remove and recreate Docker containers for the OpenAI TTS Proxy service
# This script will:
# 1. Stop and remove existing containers
# 2. Remove the Docker image (optional)
# 3. Rebuild and start the containers

set -e

echo "🔄 Restarting Docker containers for OpenAI TTS Proxy..."

# Stop and remove existing containers
echo "📦 Stopping and removing existing containers..."
docker-compose down --remove-orphans

# Remove the custom image (optional - uncomment if you want to force rebuild)
# echo "🗑️  Removing custom image..."
# docker rmi matovu90/openai-proxy || true

# Remove any dangling images
echo "🧹 Cleaning up dangling images..."
docker image prune -f

# Rebuild and start the containers
echo "🔨 Building and starting containers..."
docker-compose up --build -d

# Wait a moment for containers to start
echo "⏳ Waiting for containers to start..."
sleep 5

# Check container status
echo "📊 Container status:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Test health endpoint
echo "🏥 Testing health endpoint..."
if curl -f http://localhost/health > /dev/null 2>&1; then
    echo "✅ Health check passed!"
else
    echo "❌ Health check failed!"
    echo "📋 Container logs:"
    docker logs openai-tts-proxy --tail 20
fi

echo "🎉 Docker restart complete!"
echo "🌐 Service available at: http://localhost"
echo "🔧 Direct service at: http://localhost:5458"
echo ""
echo "📝 Note: Nginx timeouts have been increased to 120s for TTS generation"
echo "📝 Note: Server timeout increased to 2 minutes for OpenAI API calls"
