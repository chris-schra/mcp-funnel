## Overview
MCP Funnel implements comprehensive OAuth2 authentication support and (in addition to stdio) HTTP-based transport mechanisms (SSE, WebSocket, Streamable HTTP) for the MCP library, enabling secure authenticated connections to remote MCP servers.

## Authentication Features

### OAuth2 Implementation
- **Client Credentials Flow** (RFC 6749 Section 4.4)
    - Automatic token acquisition and refresh
    - Proactive refresh scheduling (5 minutes before expiry)
    - Audience validation for enhanced security
    - Environment variable resolution for secrets

- **Authorization Code Flow with PKCE** (RFC 6749 Section 4.1 + RFC 7636)
    - Browser-based user authorization
    - PKCE security for public clients
    - State management for concurrent OAuth flows
    - Automatic cleanup via FinalizationRegistry
    - O(1) state lookup for callback handling

### Token Storage
- **Multiple storage backends**:
    - Memory storage (development/testing)
    - OS Keychain integration (macOS via `security`, Windows via `cmdkey` + PowerShell)
    - Secure file storage for Linux (permission-restricted, not encrypted)
- Automatic refresh scheduling
- Secure token handling with comprehensive sanitization

### Security Features
- Tokens transmitted exclusively via headers (never in URLs)
- Command injection prevention using execFile with argument arrays
- Comprehensive token sanitization in logs and error messages
- Request correlation with unique IDs for debugging
- Retry logic with exponential backoff for transient failures

## Transport Implementations
### Server-Sent Events (SSE)
- EventSource-based server→client streaming
- HTTP POST for client→server messages
- Custom fetch function for auth header injection
- Automatic reconnection with exponential backoff
- 401 response handling with token refresh retry

### WebSocket
- Bidirectional real-time communication
- Auth headers during handshake
- Connection state management
- Ping/pong health checking
- Automatic reconnection support

### Streamable HTTP
- Request/response pattern over HTTP
- Streaming response support
- Auth header integration
- Timeout and retry handling

## Architecture Improvements
### Base Transport Abstraction
- `BaseClientTransport` class providing common functionality
- Unified auth provider integration
- Reconnection management with configurable strategies
- Standardized error handling and logging

### Proxy Enhancements
- Dynamic auth provider creation based on config
- Support for multiple auth types per server
- Enhanced disconnect/reconnect handling
- Manual and automatic reconnection support
- Server status tracking and event emission

### SEAMS Pattern Implementation
- Clean extension points for future auth methods
- Transport interface allowing new implementations
- Token storage interface for custom backends
- Minimal abstraction following YAGNI principles

## Testing
- **Comprehensive test coverage**:
    - Unit tests with mocked dependencies
    - Integration tests with real servers
    - Security tests for token exposure prevention
    - Command injection prevention tests
- Test infrastructure improvements:
    - Mock SSE server for controlled testing
    - Mock EventSource implementation
    - WebSocket testing with real connections

## Breaking Changes
None - backward compatible with existing stdio transport configurations

## Configuration Examples
```typescript
// OAuth2 Client Credentials
{
  transport: { type: 'sse', url: 'https://api.example.com/mcp' },
  auth: {
    type: 'oauth2-client',
    clientId: 'your-client-id',
    clientSecret: 'your-client-secret',
    tokenEndpoint: 'https://auth.example.com/token',
    scope: 'mcp:read mcp:write'
  }
}

// OAuth2 Authorization Code
{
  transport: { type: 'websocket', url: 'wss://api.example.com/mcp' },
  auth: {
    type: 'oauth2-code',
    clientId: 'your-client-id',
    authorizationEndpoint: 'https://auth.example.com/authorize',
    tokenEndpoint: 'https://auth.example.com/token',
    redirectUri: 'http://localhost:3000/callback'
  }
}
```

## Complete Configuration Examples

### Basic Bearer Token Authentication
```json
{
  "servers": {
    "api-server": {
      "transport": {
        "type": "sse",
        "url": "https://api.example.com/mcp/events"
      },
      "auth": {
        "type": "bearer",
        "token": "${API_TOKEN}"
      }
    }
  }
}
```

**Note**: Environment variables like `${API_TOKEN}` are automatically resolved from `process.env`

### OAuth2 Client Credentials with Environment Variables
```json
{
  "servers": {
    "secure-api": {
      "transport": {
        "type": "websocket",
        "url": "wss://api.example.com/mcp"
      },
      "auth": {
        "type": "oauth2-client",
        "clientId": "${OAUTH_CLIENT_ID}",
        "clientSecret": "${OAUTH_CLIENT_SECRET}",
        "tokenEndpoint": "https://auth.example.com/oauth/token",
        "scope": "read:mcp write:mcp",
        "audience": "https://api.example.com"
      }
    }
  }
}
```

### OAuth2 Authorization Code for User-Authenticated Access
```json
{
  "servers": {
    "user-server": {
      "transport": {
        "type": "streamable-http",
        "url": "https://api.example.com/mcp/stream"
      },
      "auth": {
        "type": "oauth2-code",
        "clientId": "mcp-client-123",
        "clientSecret": "${CLIENT_SECRET}",
        "authorizationEndpoint": "https://auth.example.com/authorize",
        "tokenEndpoint": "https://auth.example.com/token",
        "redirectUri": "http://localhost:3456/api/oauth/callback",
        "scope": "profile mcp:full-access",
        "audience": "https://api.example.com"
      }
    }
  }
}
```

**Note**: The `clientSecret` is optional for public clients (e.g., browser-based apps)

### Mixed Authentication Environments
```json
{
  "servers": {
    "local-server": {
      "transport": {
        "type": "stdio",
        "command": "mcp-server",
        "args": ["--mode", "local"]
      }
    },
    "staging-server": {
      "transport": {
        "type": "sse",
        "url": "https://staging.example.com/mcp"
      },
      "auth": {
        "type": "bearer",
        "token": "${STAGING_TOKEN}"
      }
    },
    "production-server": {
      "transport": {
        "type": "websocket",
        "url": "wss://api.example.com/mcp"
      },
      "auth": {
        "type": "oauth2-client",
        "clientId": "${PROD_CLIENT_ID}",
        "clientSecret": "${PROD_CLIENT_SECRET}",
        "tokenEndpoint": "https://auth.example.com/token",
        "scope": "production:mcp"
      }
    }
  }
}
```

## Usage Examples

### Programmatic Usage

```typescript
import { MCPProxy } from '@mcp-funnel/mcp';
import { OAuth2ClientCredentialsProvider } from '@mcp-funnel/mcp/auth';
import { SSEClientTransport } from '@mcp-funnel/mcp/transports';
import { MemoryTokenStorage } from '@mcp-funnel/mcp/auth/storage';

// Create auth provider
const tokenStorage = new MemoryTokenStorage();
const authProvider = new OAuth2ClientCredentialsProvider({
  type: 'oauth2-client',
  clientId: process.env.CLIENT_ID!,
  clientSecret: process.env.CLIENT_SECRET!,
  tokenEndpoint: 'https://auth.example.com/token',
  scope: 'mcp:read mcp:write'
}, tokenStorage);

// Create transport with auth
const transport = new SSEClientTransport({
  url: 'https://api.example.com/mcp/events',
  authProvider,
  timeout: 30000,
  reconnectConfig: {
    maxAttempts: 10,
    initialDelayMs: 1000,
    maxDelayMs: 60000
  }
});

// Initialize proxy with configuration
const proxy = new MCPProxy({
  servers: {
    'remote-server': {
      transport: {
        type: 'sse',
        url: 'https://api.example.com/mcp/events'
      },
      auth: {
        type: 'oauth2-client',
        clientId: process.env.CLIENT_ID!,
        clientSecret: process.env.CLIENT_SECRET!,
        tokenEndpoint: 'https://auth.example.com/token'
      }
    }
  }
});

await proxy.start();
```

### Handling OAuth2 Authorization Code Flow

```typescript
// In your Express/Hono server
app.get('/api/oauth/callback', async (req, res) => {
  const { code, state } = req.query;

  try {
    // Complete the OAuth flow
    await proxy.completeOAuthFlow(state as string, code as string);
    res.send('Authorization successful! You can close this window.');
  } catch (error) {
    res.status(400).send('Authorization failed: ' + error.message);
  }
});
```

### Custom Token Storage Implementation

```typescript
import type { ITokenStorage, TokenData } from '@mcp-funnel/mcp/auth';

class RedisTokenStorage implements ITokenStorage {
  constructor(private redis: RedisClient, private keyPrefix: string) {}

  async store(token: TokenData): Promise<void> {
    const key = `${this.keyPrefix}:token`;
    const ttl = Math.floor((token.expiresAt.getTime() - Date.now()) / 1000);
    await this.redis.setex(key, ttl, JSON.stringify(token));
  }

  async retrieve(): Promise<TokenData | null> {
    const data = await this.redis.get(`${this.keyPrefix}:token`);
    if (!data) return null;

    const parsed = JSON.parse(data);
    return {
      ...parsed,
      expiresAt: new Date(parsed.expiresAt)
    };
  }

  async isExpired(): Promise<boolean> {
    const token = await this.retrieve();
    if (!token) return true;
    return new Date() >= token.expiresAt;
  }

  async clear(): Promise<void> {
    await this.redis.del(`${this.keyPrefix}:token`);
  }

  scheduleRefresh(callback: () => void | Promise<void>): void {
    // Implement refresh scheduling logic
  }
}
```

## Security Best Practices

1. **Never commit credentials**: Always use environment variables or secure secret management
2. **Use HTTPS/WSS in production**: Enforce encrypted transports for all OAuth flows
3. **Implement token rotation**: Leverage automatic refresh to minimize token lifetime
4. **Validate audiences**: Always specify and validate the `audience` parameter when available
5. **Use PKCE for public clients**: Authorization code flow automatically implements PKCE
6. **Sanitize logs**: The library automatically sanitizes tokens in logs, but be careful in your own code
7. **Secure token storage**: Use OS keychain when available, restrict file permissions on Linux

## Troubleshooting

### Common Issues and Solutions

#### Token Refresh Loops
```typescript
// Problem: Token expires immediately after refresh
// Solution: Check server clock synchronization
const provider = new OAuth2ClientCredentialsProvider({
  // ... config
}, storage);

// Add logging to debug
provider.on('token:refreshed', (token) => {
  console.log('Token refreshed, expires at:', token.expiresAt);
  console.log('Current time:', new Date());
});
```

#### Windows Credential Storage Issues
```typescript
// If PowerShell PasswordVault fails, check execution policy
// Run in PowerShell as admin:
// Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

#### Authorization Code Flow Timeout
```typescript
// Increase timeout for slow authorization servers
const AUTH_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes instead of default 5
```

## API References

### Auth Providers
- `IAuthProvider` - Base interface for all auth providers
- `OAuth2ClientCredentialsProvider` - Machine-to-machine authentication
- `OAuth2AuthCodeProvider` - User authentication with browser flow
- `BearerTokenAuthProvider` - Simple bearer token authentication
- `NoAuthProvider` - Explicitly no authentication

### Token Storage
- `ITokenStorage` - Interface for token persistence
- `MemoryTokenStorage` - In-memory storage (development)
- `KeychainTokenStorage` - OS-native secure storage
- `TokenStorageFactory` - Factory for creating appropriate storage

### Transports
- `BaseClientTransport` - Abstract base class for all transports
- `SSEClientTransport` - Server-Sent Events transport
- `WebSocketClientTransport` - WebSocket bidirectional transport
- `StreamableHttpClientTransport` - HTTP streaming transport
- `StdioClientTransport` - Standard I/O transport (local processes)

## Known Limitations

- **Windows**: Full implementation using PowerShell PasswordVault API
- **Linux**: Uses file storage with restrictive permissions (0o600) - no native keychain API, tokens stored in plaintext at `~/.mcp-funnel/tokens`
- SSE transport requires EventSource polyfill in Node.js (included)
- WebSocket ping/pong may not work with all proxy servers
- Authorization code flow requires manual browser interaction