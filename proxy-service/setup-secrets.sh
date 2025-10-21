#!/bin/bash

# Setup script for Docker secrets
# This script helps create the required Docker secret for the OpenAI API key

set -e

SECRET_NAME="openai_api_key"
SECRET_FILE="openai_api_key.txt"

echo "🔐 Setting up Docker secret for OpenAI API key..."

# Check if secret already exists
if docker secret ls | grep -q "$SECRET_NAME"; then
    echo "⚠️  Secret '$SECRET_NAME' already exists."
    read -p "Do you want to update it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "🗑️  Removing existing secret..."
        docker secret rm "$SECRET_NAME"
    else
        echo "✅ Using existing secret."
        exit 0
    fi
fi

# Get API key from user
if [ -z "$OPENAI_API_KEY" ]; then
    echo "Please enter your OpenAI API key:"
    read -s OPENAI_API_KEY
fi

if [ -z "$OPENAI_API_KEY" ]; then
    echo "❌ No API key provided. Exiting."
    exit 1
fi

# Create secret file
echo "$OPENAI_API_KEY" > "$SECRET_FILE"

# Create Docker secret
echo "🔑 Creating Docker secret..."
docker secret create "$SECRET_NAME" "$SECRET_FILE"

# Clean up secret file
rm "$SECRET_FILE"

echo "✅ Secret '$SECRET_NAME' created successfully!"
echo "🚀 You can now deploy the stack with: docker stack deploy -c docker-stack.yml openai-tts-stack"
