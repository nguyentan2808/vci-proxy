# CORS Proxy Server

A Node.js proxy server to bypass CORS restrictions for HTTP requests and WebSocket connections.

## Features

- HTTP request proxying with CORS headers
- WebSocket connection proxying
- Dynamic target URL configuration
- Health check endpoint

## Installation

```bash
cd proxy-server
npm install
```

## Usage

### Start the server

```bash
npm start
# or
npm run dev
```

The server will run on port 3001 by default.

### HTTP Proxy

Proxy HTTP requests by adding the target URL as a query parameter:

```
GET http://localhost:3001/proxy?target=https://api.example.com/data
```

Or use the `X-Target-Url` header:

```javascript
fetch('http://localhost:3001/proxy/api/endpoint', {
  headers: {
    'X-Target-Url': 'https://api.example.com'
  }
})
```

### WebSocket Proxy

Connect to WebSocket endpoints through the proxy:

```javascript
const ws = new WebSocket('ws://localhost:3001/ws?target=wss://api.example.com/websocket');
```

### Health Check

```
GET http://localhost:3001/health
```

## Environment Variables

- `PORT`: Server port (default: 3001)

## API Endpoints

- `GET /` - Usage instructions
- `GET /health` - Health check
- `ALL /proxy` - HTTP proxy endpoint
- `WS /ws` - WebSocket proxy endpoint