# StreamableHTTP MCP Transport Server

## Overview

The StreamableHTTP endpoint exposes the full MCPProxy server (with all aggregated tools from multiple MCP servers) through the StreamableHTTP transport, which supports both Server-Sent Events (SSE) streaming and direct JSON responses.

**Base URL:** `/api/streamable/mcp`

## Supported HTTP Methods

### GET
- Establishes an SSE stream for real-time bidirectional communication
- Returns a persistent connection that streams MCP messages
- Supports session resumption via `Last-Event-ID` header

**Example:**
```bash
GET /api/streamable/mcp
```

### POST
- Sends JSON-RPC messages to the MCP server
- Requires valid JSON-RPC 2.0 message in request body
- Returns JSON response or continues SSE stream

**Example:**
```bash
POST /api/streamable/mcp
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "method": "tools/list",
  "id": 1
}
```

### DELETE
- Terminates active sessions and cleans up resources
- Useful for graceful session cleanup

**Example:**
```bash
DELETE /api/streamable/mcp
```

## Authentication Integration

The StreamableHTTP transport supports authentication through the `IncomingMessage.auth` property. To integrate with auth middleware:

1. Add auth middleware before the streamable route
2. Set `req.auth` with AuthInfo object containing authentication details
3. The transport will automatically include auth context in MCP messages

## Session Management

- Uses UUID-based session IDs for stateful connections
- Session state is maintained in memory
- Sessions are automatically created on first request
- Sessions can be explicitly terminated via DELETE requests

## Error Handling

| Error Type | HTTP Status | Description |
|------------|-------------|-------------|
| Invalid JSON | 400 Bad Request | Invalid JSON in POST request body |
| Server Error | 500 Internal Server Error | Server errors with detailed message |
| Transport Error | - | Logged and handled gracefully |

## Usage Examples

### TypeScript Client

Connect StreamableHTTP client to access all MCPProxy tools:

```typescript
import { StreamableHTTPClientTransport } from 'mcp-funnel';

const transport = new StreamableHTTPClientTransport({
  url: 'http://localhost:3456/api/streamable/mcp',
  authProvider: yourAuthProvider, // optional
});

await transport.start();
// Now you have access to all MCPProxy aggregated tools!
```

### Direct HTTP Requests

#### Establish SSE Stream
```bash
curl -N -H "Accept: text/event-stream" \
  http://localhost:3456/api/streamable/mcp
```

#### Send MCP Request
```bash
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}' \
  http://localhost:3456/api/streamable/mcp
```

## Health Check Endpoint

**URL:** `/api/streamable/health`
**Method:** `GET`

Returns the health status of the StreamableHTTP transport:

```json
{
  "status": "ok",
  "transport": "streamable-http",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "endpoints": {
    "mcp": "/api/streamable/mcp",
    "health": "/api/streamable/health"
  },
  "documentation": {
    "protocol": "MCP Streamable HTTP",
    "methods": ["GET", "POST", "DELETE"],
    "description": {
      "GET": "Establishes SSE stream for real-time MCP communication",
      "POST": "Sends JSON-RPC messages to MCP server",
      "DELETE": "Terminates active sessions"
    },
    "authentication": "Compatible with existing auth middleware - auth info can be passed via request headers",
    "sessionManagement": "Stateful with UUID-based session IDs"
  }
}
```