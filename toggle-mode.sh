#!/bin/bash

# Server Mode Toggle Script
# Usage: ./toggle-mode.sh [proxy|cache]

MODE=${1:-cache}

if [ "$MODE" != "proxy" ] && [ "$MODE" != "cache" ]; then
    echo "Usage: $0 [proxy|cache]"
    echo "  proxy - Use original proxy mode"
    echo "  cache - Use new caching mode"
    exit 1
fi

echo "Setting server mode to: $MODE"

# Set environment variable and start server
export SERVER_MODE=$MODE

echo "Starting server in $MODE mode..."
echo "Press Ctrl+C to stop"

cd "$(dirname "$0")"
npm start
