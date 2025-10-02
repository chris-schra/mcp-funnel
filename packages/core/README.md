# @mcp-funnel/core

Core infrastructure package for MCP Funnel.
Provides transport implementations, secret management, logging, authentication utilities, and resilient connection 
management.

## Installation

```bash
yarn add @mcp-funnel/core
```

## Features

- **Multiple Transport Implementations**: stdio, SSE, HTTP, and WebSocket client transports for MCP communication
- **Secret Management**: Secure secret provider system with dotenv, process env, and inline providers
- **Structured Logging**: Pino-based logging with automatic credential redaction
- **Connection Resilience**: Exponential backoff and automatic reconnection management
- **Authentication Utilities**: Interfaces and types for implementing OAuth and bearer token auth
- **Environment Resolution**: Secure variable interpolation with ${VAR} patterns and circular reference detection

## Key Components

### Transports

Client transport implementations for the Model Context Protocol:

- **StdioClientTransport**: Communicates with child processes via stdin/stdout using newline-delimited JSON-RPC
- **SSEClientTransport**: Server-Sent Events transport with OAuth authentication support
- **StreamableHttpClientTransport**: HTTP-based streaming transport
- **WebSocketClientTransport**: WebSocket-based bidirectional transport
- **BaseClientTransport**: Abstract base class with shared transport functionality

All transports implement the MCP SDK `Transport` interface for seamless integration.

### Secret Management

Secure secret provider system with fine-grained control:

- **SecretManager**: Orchestrates multiple secret providers with precedence rules
- **Providers**:
  - `DotEnvProvider`: Loads secrets from .env files
  - `ProcessEnvProvider`: Filters process environment variables by prefix
  - `InlineProvider`: Defines secrets directly in configuration
- **SecretProviderRegistry**: Manages provider registration and discovery
- **Security Features**:
  - Environment variable filtering to prevent credential leakage
  - Minimal exposure to child processes
  - Built-in redaction for logging

### Logging

Structured logging infrastructure with security-first design:

- **Pino Integration**: High-performance JSON logging via pino
- **Automatic Redaction**: Sensitive data sanitization using fast-redact
- **Scoped Loggers**: Create child loggers with context
- **Legacy Support**: Backwards-compatible logging interface

### Reconnection Management

Resilient connection handling with intelligent retry logic:

- **ReconnectionManager**: Manages connection lifecycle with exponential backoff
- **State Tracking**: Observable connection state transitions (Connecting, Connected, Reconnecting, Disconnected, Failed)
- **Configurable Backoff**: Customizable retry delays, max attempts, and jitter
- **Event Handlers**: Subscribe to state changes for monitoring

### Authentication

Interfaces for implementing authentication providers:

- **IAuthProvider**: Interface for authentication providers (headers, validation, refresh)
- **ITokenStorage**: Token lifecycle management with expiration tracking
- **TokenData**: OAuth token data structure with metadata

### Environment Resolution

Secure environment variable interpolation:

- **EnvVarPatternResolver**: Resolves `${VAR}` and `${VAR:default}` patterns
- **Security Protections**:
  - Circular reference detection
  - Maximum depth limits
  - Variable name validation to prevent injection
- **Utility Functions**:
  - `resolveEnvVar`: Resolve a single variable
  - `resolveConfigFields`: Resolve specific fields in config objects

## Usage Examples

### Creating a Transport

```typescript
import { StdioClientTransport } from '@mcp-funnel/core';

const transport = new StdioClientTransport('my-server', {
  command: 'npx',
  args: ['-y', '@modelcontextprotocol/server-memory'],
  env: { NODE_ENV: 'production' },
  cwd: '/path/to/working/dir',
});

await transport.start();
```

### Using Secret Manager

```typescript
import { SecretManager, createSecretProviders } from '@mcp-funnel/core';

const providers = createSecretProviders([
  { type: 'dotenv', config: { path: '.env' } },
  { type: 'process', config: { prefix: 'MCP_' } },
  { type: 'inline', config: { values: { API_KEY: 'secret' } } },
]);

const secretManager = new SecretManager(providers);
const secrets = await secretManager.resolveSecrets();

// Use secrets with environment variable resolution
const resolvedEnv = {
  ...secrets,
  DATABASE_URL: resolveEnvVar('${DB_HOST}:${DB_PORT}/${DB_NAME}'),
};
```

### Managing Reconnection

```typescript
import { ReconnectionManager } from '@mcp-funnel/core';

const reconnectionManager = new ReconnectionManager({
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  maxAttempts: 10,
  backoffMultiplier: 2,
  jitter: 0.25,
});

reconnectionManager.onStateChange((event) => {
  console.log(`Connection: ${event.from} -> ${event.to}`);
  if (event.nextRetryDelay) {
    console.log(`Next retry in ${event.nextRetryDelay}ms`);
  }
});

// During connection attempt
reconnectionManager.onConnecting();
try {
  await connectToServer();
  reconnectionManager.onConnected();
} catch (error) {
  reconnectionManager.onDisconnected(error);
  await reconnectionManager.scheduleReconnect(() => connectToServer());
}
```

### Environment Variable Resolution

```typescript
import { EnvVarPatternResolver, resolveEnvVar } from '@mcp-funnel/core';

// Simple resolution
const url = resolveEnvVar('${API_HOST}:${API_PORT}');

// With default values
const resolver = new EnvVarPatternResolver();
const config = resolver.resolve('${NODE_ENV:development}');

// Resolve specific config fields
import { resolveConfigFields } from '@mcp-funnel/core';

const config = {
  apiUrl: '${API_BASE_URL}/v1',
  token: '${API_TOKEN}',
  timeout: 5000, // Not resolved
};

const resolved = resolveConfigFields(config, ['apiUrl', 'token']);
```


## License

MIT

