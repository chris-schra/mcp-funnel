# @mcp-funnel/models

Core TypeScript types and enums used across MCP Funnel packages.

This package provides shared type definitions for transport configurations, authentication, server status, OAuth 2.0
implementation, and environment variable resolution.  
It serves as the foundational type system for MCP Funnel's internal architecture.

## Key Exports

### Transport Types

**Discriminated Unions:**
- `TransportConfig` - Union of all transport configuration types

**Transport-Specific Configs:**
- `StdioTransportConfig` - Standard input/output transport (command, args, env)
- `SSETransportConfig` - Server-sent events transport (url, timeout, reconnect)
- `WebSocketTransportConfig` - WebSocket transport (url, timeout, reconnect)
- `StreamableHTTPTransportConfig` - HTTP streaming transport (url, timeout, reconnect, sessionId)

**Connection Management:**
- `ConnectionState` - Enum: `Disconnected`, `Connecting`, `Connected`, `Reconnecting`, `Failed`
- `ConnectionStateChange` - Interface for connection state transitions
- `ReconnectionConfig` - Reconnection strategy configuration (maxAttempts, delays, backoff, jitter)

### Authentication Types

**Discriminated Union:**
- `AuthConfig` - Union of all authentication configuration types

**Auth-Specific Configs:**
- `NoAuthConfig` - No authentication required (`type: 'none'`)
- `BearerAuthConfig` - Static bearer token authentication (`type: 'bearer'`)
- `OAuth2ClientCredentialsConfig` - OAuth 2.0 client credentials flow (`type: 'oauth2-client'`)
- `OAuth2AuthCodeConfig` - OAuth 2.0 authorization code flow (`type: 'oauth2-code'`)

### OAuth 2.0 Provider Types

MCP Funnel includes a complete OAuth 2.0 Authorization Server implementation with these types:

**Core Types:**
- `AccessToken` - Access token with metadata (token, client_id, user_id, scopes, expires_at)
- `RefreshToken` - Refresh token data structure
- `AuthorizationCode` - Authorization code for code flow
- `ClientRegistration` - OAuth client registration data
- `TokenRequest` - Token endpoint request parameters
- `TokenResponse` - Token endpoint response structure
- `AuthorizationRequest` - Authorization endpoint request parameters
- `UserConsentScope` - User consent information for scopes
- `RecordUserConsentOptions` - Options for recording user consent

**Provider Interfaces:**
- `IOAuthProviderStorage` - Storage interface for OAuth provider state
- `IUserConsentService` - Service interface for user consent management
- `OAuthProviderConfig` - Configuration for OAuth provider
- `OAuthError` - OAuth error response structure

**Constants:**
- `OAuthErrorCodes` - Standard OAuth 2.0 error codes (`invalid_request`, `invalid_client`, `invalid_grant`, etc.)
- `GrantTypes` - OAuth 2.0 grant types (`authorization_code`, `refresh_token`, `client_credentials`)
- `ResponseTypes` - OAuth 2.0 response types (`code`)
- `CodeChallengeMethods` - PKCE code challenge methods (`plain`, `S256`)

### Server Types

- `ServerStatus` - Runtime status information for MCP servers (`name`, `status`, `connectedAt`, `error`)
- `ServerConnectedEventPayload` - Event payload for server connection
- `ServerDisconnectedEventPayload` - Event payload for server disconnection
- `ServerReconnectingEventPayload` - Event payload for reconnection attempts

### Configuration Types

- `EnvVarPatternResolverConfig` - Configuration for environment variable pattern resolution (maxDepth, strict mode, custom envSource)

## For Package Developers

This is an **internal infrastructure package** used by other packages in the MCP Funnel monorepo:

- `@mcp-funnel/core` - Uses transport and server types
- `@mcp-funnel/web` - Uses OAuth provider types
- `@mcp-funnel/shared` - Uses authentication and configuration types

The types are designed with **seams** (extension points) to support future enhancements without breaking changes. For example:

- `TransportConfig` is a discriminated union allowing new transport types to be added
- `AuthConfig` is a discriminated union allowing new authentication methods to be added
- OAuth types follow RFC 6749 and RFC 7636 (PKCE) specifications

## TypeScript Support

This package is ESM-only and includes full TypeScript type definitions. All exports are fully typed with JSDoc comments for IDE support.

## License

MIT
