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
    - OS Keychain integration (macOS via `security`, Windows via `cmdkey`)
    - Encrypted file fallback for Linux/unsupported platforms
- Automatic refresh scheduling with configurable buffer time
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
    - 157 OAuth-specific tests passing
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

## Known Limitations

- Windows credential retrieval now uses PowerShell PasswordVault API for full implementation
- Linux uses file storage (no native keychain API)