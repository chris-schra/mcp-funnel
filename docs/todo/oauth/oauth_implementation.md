# OAuth & SSE Transport - Extensible Implementation

## Architecture Philosophy

Build OAuth support following MCP SDK patterns with Server-Sent Events (SSE) for server-to-client communication and HTTP POST for client-to-server messages, enabling progressive enhancement from MVP to production-ready authentication.

## Required Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.18.0",
    "eventsource": "^2.0.2",
    "uuid": "^9.0.1",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "@types/eventsource": "^1.1.12",
    "@types/uuid": "^9.0.7",
    "vitest": "^1.0.0"
  }
}
```

## Core Abstractions with Extension Points

### 1. Transport Layer Implementation - Using SDK Interface Directly

```typescript
// NO CUSTOM TRANSPORT INTERFACE - Use MCP SDK's Transport directly
import { Transport, MessageExtraInfo, JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

// SSEClientTransport implements SDK's Transport interface directly
// This includes SSE reconnection with exponential backoff in MVP (not postponed)
export class SSEClientTransport implements Transport {
  private eventSource?: EventSource;
  private pendingRequests = new Map<string | number, (response: any) => void>();
  private messageQueue: JSONRPCMessage[] = [];
  private connected = false;

  // Required Transport interface methods
  async start(): Promise<void> {
    // Establish SSE connection for server→client messages
    // Setup HTTP POST endpoint for client→server messages
  }

  async send(message: JSONRPCMessage): Promise<void> {
    // Send via HTTP POST with message correlation
  }

  async close(): Promise<void> {
    // Close SSE connection and cleanup
  }

  // Event handlers - exact MCP SDK signature
  onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  // OAuth-specific method (matches SDK's SSEClientTransport)
  async finishAuth(params: URLSearchParams, headers: Record<string, string>): Promise<void> {
    // Complete OAuth authorization code flow if needed
  }
}

// src/transports/interfaces/transport-config.interface.ts
export interface StdioTransportConfig {
  type: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
}

export interface SSETransportConfig {
  type: 'sse';
  url: string;
  auth?: AuthConfig;
  headers?: Record<string, string>;
  timeout?: number;
  retryConfig?: RetryConfig;
  reconnectDelay?: number;
}

export interface WebSocketTransportConfig {
  type: 'websocket';
  url: string;
  auth?: AuthConfig;
  reconnectConfig?: ReconnectConfig;
}

export type TransportConfig =
  | StdioTransportConfig
  | SSETransportConfig
  | WebSocketTransportConfig;
```

### 2. Authentication Provider Abstraction (Following Registry I-prefix Pattern)

```typescript
// packages/mcp/src/auth/interfaces/auth-provider.interface.ts
// Following registry pattern: interfaces use I-prefix
export interface IAuthProvider {
  /**
   * Get authorization headers for the request
   * @returns Headers to add to the request (e.g., { Authorization: 'Bearer token' })
   */
  getAuthHeaders(): Promise<Record<string, string>>;

  /**
   * Refresh the authentication credentials
   * @throws AuthenticationError if refresh fails
   */
  refresh(): Promise<void>;

  /**
   * Check if current credentials are expired
   */
  isExpired(): boolean;

  /**
   * Validate the token is for the correct audience/resource
   * @param audience Expected audience identifier
   * @throws InvalidAudienceError if validation fails
   */
  validateAudience(audience?: string): Promise<void>;

  /**
   * Get token metadata (for debugging/logging)
   */
  getTokenInfo(): TokenInfo | null;
}

export interface TokenInfo {
  type: 'bearer' | 'oauth2';
  expiresAt?: Date;
  scopes?: string[];
  audience?: string;
  subject?: string;
}

// src/auth/interfaces/auth-config.interface.ts
export interface NoAuthConfig {
  type: 'none';
}

export interface BearerAuthConfig {
  type: 'bearer';
  token: string; // Can use ${ENV_VAR} syntax
}

export interface OAuth2ClientCredentialsConfig {
  type: 'oauth2-client';
  clientId: string;
  clientSecret: string; // Should use ${ENV_VAR}
  tokenEndpoint: string;
  audience?: string;
  scopes?: string[];
}

export interface OAuth2AuthCodeConfig {
  type: 'oauth2-code';
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri: string;
  scopes?: string[];
}

export type AuthConfig =
  | NoAuthConfig
  | BearerAuthConfig
  | OAuth2ClientCredentialsConfig
  | OAuth2AuthCodeConfig;
```

### 3. Token Storage with Proactive Refresh (MVP: In-Memory)

```typescript
// packages/mcp/src/auth/interfaces/token-storage.interface.ts
// Following registry pattern: interfaces use I-prefix
export interface ITokenStorage {
  /**
   * Store a token for a server
   * @param serverId Unique identifier for the server
   * @param token Token data to store
   */
  store(serverId: string, token: StoredToken): Promise<void>;

  /**
   * Retrieve a token for a server
   * @param serverId Unique identifier for the server
   * @returns Token if found and not expired, null otherwise
   */
  retrieve(serverId: string): Promise<StoredToken | null>;

  /**
   * Remove a token for a server
   * @param serverId Unique identifier for the server
   */
  remove(serverId: string): Promise<void>;

  /**
   * Clear all stored tokens
   */
  clear(): Promise<void>;
}

export interface StoredToken {
  accessToken: string;
  tokenType: string;
  expiresAt: Date;
  refreshToken?: string;
  scopes?: string[];
  audience?: string;
}

// src/auth/implementations/memory-token-storage.ts (MVP)
export class MemoryTokenStorage implements ITokenStorage {
  private tokens = new Map<string, StoredToken>();
  private refreshTimers = new Map<string, NodeJS.Timeout>();
  private refreshCallbacks = new Map<string, () => Promise<void>>();

  async store(serverId: string, token: StoredToken): Promise<void> {
    // Clear existing refresh timer
    const existingTimer = this.refreshTimers.get(serverId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    this.tokens.set(serverId, token);

    // Schedule proactive refresh (5 minutes before expiry)
    if (token.expiresAt) {
      const expiresInMs = token.expiresAt.getTime() - Date.now();
      const refreshInMs = Math.max(0, expiresInMs - (5 * 60 * 1000));

      if (refreshInMs > 0) {
        const timer = setTimeout(async () => {
          const callback = this.refreshCallbacks.get(serverId);
          if (callback) {
            try {
              await callback();
            } catch (error) {
              console.error(`Failed to refresh token for ${serverId}:`, error);
            }
          }
        }, refreshInMs);

        this.refreshTimers.set(serverId, timer);
      }
    }
  }

  setRefreshCallback(serverId: string, callback: () => Promise<void>): void {
    this.refreshCallbacks.set(serverId, callback);
  }

  async retrieve(serverId: string): Promise<StoredToken | null> {
    const token = this.tokens.get(serverId);
    if (!token) return null;

    // Check expiry
    if (token.expiresAt < new Date()) {
      this.tokens.delete(serverId);
      return null;
    }

    return token;
  }

  async remove(serverId: string): Promise<void> {
    const timer = this.refreshTimers.get(serverId);
    if (timer) {
      clearTimeout(timer);
      this.refreshTimers.delete(serverId);
    }
    this.refreshCallbacks.delete(serverId);
    this.tokens.delete(serverId);
  }

  async clear(): Promise<void> {
    // Clear all timers
    for (const timer of this.refreshTimers.values()) {
      clearTimeout(timer);
    }
    this.refreshTimers.clear();
    this.refreshCallbacks.clear();
    this.tokens.clear();
  }
}

// Phase 2: Keychain storage
// src/auth/implementations/keychain-token-storage.ts
// export class KeychainTokenStorage implements ITokenStorage { ... }
```

### 4. Transport Factory with Dependency Injection

```typescript
// packages/mcp/src/transports/transport-factory.ts
import { Transport } from '@modelcontextprotocol/sdk/types.js';  // Use SDK Transport
import { IAuthProvider } from '../auth/interfaces/auth-provider.interface.js';
import { ITokenStorage } from '../auth/interfaces/token-storage.interface.js';
import { TargetServer } from '../config.js';  // Existing type

export class TransportFactory {
  constructor(
    private tokenStorage: ITokenStorage = new MemoryTokenStorage()
  ) {}

  async create(server: TargetServer): Promise<Transport> {  // Returns SDK Transport
    // Backwards compatibility: if 'command' exists, use stdio
    if (server.command) {
      return new StdioClientTransport(server.name, {
        command: server.command,
        args: server.args,
        env: this.resolveEnvVars(server.env)
      });
    }

    // New format with explicit transport
    if (!server.transport) {
      throw new Error(`Server ${server.name} has no transport configuration`);
    }

    const config = server.transport;

    switch (config.type) {
      case 'stdio':
        return new StdioClientTransport(server.name, config);

      case 'sse':
        const authProvider = await this.createAuthProvider(
          server.name,
          config.auth
        );
        return new SSEClientTransport(
          server.name,
          config,
          authProvider
        );

      case 'websocket':
        // Future implementation
        throw new Error('WebSocket transport not yet implemented');

      default:
        throw new Error(`Unknown transport type: ${(config as any).type}`);
    }
  }

  private async createAuthProvider(
    serverId: string,
    authConfig?: AuthConfig
  ): Promise<IAuthProvider> {
    if (!authConfig || authConfig.type === 'none') {
      return new NoAuthProvider();
    }

    switch (authConfig.type) {
      case 'bearer':
        const token = this.resolveEnvVar(authConfig.token);
        return new BearerTokenAuthProvider(token);

      case 'oauth2-client':
        const clientSecret = this.resolveEnvVar(authConfig.clientSecret);
        return new OAuth2ClientCredentialsProvider(
          {
            ...authConfig,
            clientSecret
          },
          serverId,
          this.tokenStorage
        );

      case 'oauth2-code':
        // Future implementation
        throw new Error('OAuth2 authorization code flow not yet implemented');

      default:
        throw new Error(`Unknown auth type: ${(authConfig as any).type}`);
    }
  }

  private resolveEnvVar(value: string): string {
    // Support ${ENV_VAR} syntax
    const envVarMatch = value.match(/^\$\{([^}]+)\}$/);
    if (envVarMatch) {
      const envVar = envVarMatch[1];
      const envValue = process.env[envVar];
      if (!envValue) {
        throw new Error(`Environment variable ${envVar} not set`);
      }
      return envValue;
    }
    return value;
  }

  private resolveEnvVars(env?: Record<string, string>): Record<string, string> {
    if (!env) return {};

    const resolved: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
      resolved[key] = this.resolveEnvVar(value);
    }
    return resolved;
  }
}
```

### 5. SSE Transport Implementation

```typescript
// packages/mcp/src/transports/implementations/sse-client-transport.ts
import { Transport, MessageExtraInfo, JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { IAuthProvider } from '../../auth/index.js';
import { logEvent, logError } from '../../logger.js';
import EventSource from 'eventsource';  // Node.js polyfill
import { v4 as uuidv4 } from 'uuid';

// Error classes
export class TransportError extends Error {
  constructor(message: string, public code: string, public cause?: Error) {
    super(message);
    this.name = 'TransportError';
  }
}

export class SSEClientTransport implements Transport {
  private eventSource?: EventSource;
  private pendingRequests = new Map<string | number, {
    resolve: (response: any) => void;
    reject: (error: Error) => void;
    timeout?: NodeJS.Timeout;
  }>();
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;

  constructor(
    private serverName: string,
    private config: SSETransportConfig,
    private authProvider: IAuthProvider
  ) {
    this.reconnectDelay = config.reconnectDelay || 1000;
  }

  async start(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      // Validate HTTPS for production
      const url = new URL(this.config.url);
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
        throw new TransportError(
          'OAuth endpoints must use HTTPS in production',
          'INSECURE_TRANSPORT'
        );
      }

      const headers = await this.authProvider.getAuthHeaders();

      // Parse base URL to construct SSE endpoint
      const sseUrl = new URL(this.config.url);
      sseUrl.pathname = sseUrl.pathname.replace(/\/?$/, '/sse');

      // Add auth as query param for EventSource (headers not supported in browser)
      const token = headers['Authorization']?.replace('Bearer ', '');
      if (token) {
        sseUrl.searchParams.set('token', token);
      }

      // Create EventSource with auth
      this.eventSource = new EventSource(sseUrl.toString(), {
        headers: process.env.NODE_ENV === 'test' ? headers : undefined, // Headers only work in Node.js
        withCredentials: true
      });

      // Setup event handlers
      this.eventSource.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        logEvent('info', 'transport:sse:connected', {
          server: this.serverName,
          url: sseUrl.toString()
        });
      };

      this.eventSource.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as JSONRPCMessage;

          // Check if this is a response to a pending request
          if ('id' in message && message.id !== null) {
            const pending = this.pendingRequests.get(message.id);
            if (pending) {
              if (pending.timeout) {
                clearTimeout(pending.timeout);
              }
              this.pendingRequests.delete(message.id);
              pending.resolve(message);
              return;
            }
          }

          // Otherwise, it's a server-initiated message
          if (this.onmessage) {
            this.onmessage(message, { transport: 'sse' });
          }
        } catch (error) {
          logError('transport:sse:parse-error', error, {
            server: this.serverName,
            data: event.data
          });
        }
      };

      this.eventSource.onerror = (error) => {
        logError('transport:sse:error', error, {
          server: this.serverName
        });

        if (this.eventSource?.readyState === EventSource.CLOSED) {
          this.connected = false;
          this.handleReconnect();
        }

        if (this.onerror) {
          this.onerror(new Error('SSE connection error'));
        }
      };

      // Wait for connection to establish
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('SSE connection timeout'));
        }, this.config.timeout || 30000);

        const checkConnection = setInterval(() => {
          if (this.connected) {
            clearInterval(checkConnection);
            clearTimeout(timeout);
            resolve();
          }
        }, 100);
      });

    } catch (error) {
      logError('transport:sse:connection-failed', error, {
        server: this.serverName,
        url: this.config.url
      });
      throw error;
    }
  }

  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logError('transport:sse:max-reconnect-exceeded', new Error('Max reconnection attempts exceeded'), {
        server: this.serverName,
        attempts: this.reconnectAttempts
      });
      if (this.onclose) {
        this.onclose();
      }
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logEvent('info', 'transport:sse:reconnecting', {
      server: this.serverName,
      attempt: this.reconnectAttempts,
      delay
    });

    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      await this.connect();
    } catch (error) {
      // Reconnection failed, will retry
      this.handleReconnect();
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.connected) {
      throw new Error('SSE transport not connected');
    }

    try {
      // Check and refresh auth if needed
      if (this.authProvider.isExpired()) {
        await this.authProvider.refresh();
      }

      const headers = await this.authProvider.getAuthHeaders();

      // For request messages, track for correlation
      if ('id' in message && message.id !== null) {
        const promise = new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            this.pendingRequests.delete(message.id!);
            reject(new Error(`Request ${message.id} timed out`));
          }, this.config.timeout || 30000);

          this.pendingRequests.set(message.id, { resolve, reject, timeout });
        });

        // Send via HTTP POST
        await this.sendHttpRequest(message, headers);

        // Wait for correlated response via SSE
        return promise;
      } else {
        // Notification or other non-request message
        await this.sendHttpRequest(message, headers);
      }
    } catch (error) {
      const err = error as Error;
      logError('transport:sse:send-failed', error, {
        server: this.serverName,
        method: (message as any).method
      });

      // Handle auth errors with retry
      if (err.message?.includes('401') || err.message?.includes('403')) {
        try {
          await this.authProvider.refresh();
          // Retry once after refresh
          return this.send(message);
        } catch (refreshError) {
          logError('transport:sse:auth-refresh-failed', refreshError, {
            server: this.serverName
          });
        }
      }

      throw error;
    }
  }

  private async sendHttpRequest(
    message: JSONRPCMessage,
    headers: Record<string, string>
  ): Promise<void> {
    const response = await this.fetchWithRetry(this.config.url, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        ...this.config.headers
      },
      body: JSON.stringify(message),
      timeout: this.config.timeout || 30000
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
  }

  async close(): Promise<void> {
    this.connected = false;

    // Clear pending requests
    for (const [id, pending] of this.pendingRequests) {
      if (pending.timeout) {
        clearTimeout(pending.timeout);
      }
      pending.reject(new Error('Transport closed'));
    }
    this.pendingRequests.clear();

    // Close EventSource
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }

    if (this.onclose) {
      this.onclose();
    }
  }

  // OAuth-specific method for authorization code flow
  async finishAuth(params: URLSearchParams, headers: Record<string, string>): Promise<void> {
    // Complete OAuth authorization code flow
    const authCode = params.get('code');
    if (!authCode) {
      throw new Error('No authorization code provided');
    }

    // Exchange code for token (implementation depends on auth provider)
    // This would typically be handled by an OAuth2AuthCodeProvider
    logEvent('info', 'transport:sse:oauth-callback', {
      server: this.serverName,
      hasCode: !!authCode
    });
  }

  // MCP SDK Transport interface properties
  onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
  onerror?: (error: Error) => void;
  onclose?: () => void;

  private async fetchWithRetry(
    url: string,
    options: RequestInit & { timeout?: number }
  ): Promise<Response> {
    const { timeout = 30000, ...fetchOptions } = options;

    // Add timeout using AbortController
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (error) {
      clearTimeout(timeoutId);

      // Implement exponential backoff retry for network errors
      if (this.config.retryConfig?.enabled && this.shouldRetry(error)) {
        return this.retryWithBackoff(url, options);
      }

      throw error;
    }
  }

  private shouldRetry(error: unknown): boolean {
    // Retry on network errors, not on auth errors
    const message = (error as Error).message;
    return message.includes('network') ||
           message.includes('ECONNREFUSED') ||
           message.includes('timeout');
  }

  private async retryWithBackoff(
    url: string,
    options: RequestInit & { timeout?: number },
    attempt = 1
  ): Promise<Response> {
    const maxAttempts = this.config.retryConfig?.maxAttempts || 3;
    const baseDelay = this.config.retryConfig?.baseDelayMs || 1000;

    if (attempt > maxAttempts) {
      throw new Error(`Failed after ${maxAttempts} attempts`);
    }

    const delay = baseDelay * Math.pow(2, attempt - 1);
    await new Promise(resolve => setTimeout(resolve, delay));

    try {
      return await this.fetchWithRetry(url, options);
    } catch (error) {
      return this.retryWithBackoff(url, options, attempt + 1);
    }
  }
}
```

### 6. OAuth2 Client Credentials Provider

```typescript
// packages/mcp/src/auth/implementations/oauth2-client-credentials.ts
import { IAuthProvider, TokenInfo } from '../interfaces/auth-provider.interface.js';
import { ITokenStorage, StoredToken } from '../interfaces/token-storage.interface.js';
import { logEvent, logError } from '../../logger.js';  // Use existing logger
import { OAuth2ClientCredentialsConfig } from '../interfaces/auth-config.interface.js';

// Authentication error with OAuth2 error codes
export class AuthenticationError extends Error {
  constructor(
    message: string,
    public code: string,
    public isRetryable = false,
    public oauthError?: string  // RFC 6749 error code
  ) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class OAuth2ClientCredentialsProvider implements IAuthProvider {
  private tokenInfo: TokenInfo | null = null;

  constructor(
    private config: OAuth2ClientCredentialsConfig,
    private serverId: string,
    private tokenStorage: ITokenStorage  // Using I-prefix interface
  ) {
    // Register refresh callback for proactive refresh
    if ('setRefreshCallback' in tokenStorage) {
      (tokenStorage as any).setRefreshCallback(serverId, () => this.refresh());
    }
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    // Try to get cached token
    let token = await this.tokenStorage.retrieve(this.serverId);

    if (!token || this.isTokenExpired(token)) {
      await this.refresh();
      token = await this.tokenStorage.retrieve(this.serverId);
    }

    if (!token) {
      throw new AuthenticationError(
        'Failed to obtain access token',
        'TOKEN_ACQUISITION_FAILED'
      );
    }

    return {
      'Authorization': `${token.tokenType} ${token.accessToken}`
    };
  }

  async refresh(): Promise<void> {
    try {
      // Validate HTTPS
      const url = new URL(this.config.tokenEndpoint);
      if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
        throw new AuthenticationError(
          'Token endpoint must use HTTPS',
          'INSECURE_ENDPOINT',
          false
        );
      }

      const response = await fetch(this.config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          ...(this.config.audience && { audience: this.config.audience }),
          ...(this.config.scopes && { scope: this.config.scopes.join(' ') })
        })
      });

      if (!response.ok) {
        let errorData: any = {};
        try {
          errorData = await response.json();
        } catch {
          errorData = { error: 'unknown_error', error_description: await response.text() };
        }

        // Log auth failure using existing logger
        logError('auth:token_request_failed', new Error(errorData.error_description || errorData.error), {
          server: this.serverId,
          oauthError: errorData.error,
          status: response.status
        });

        throw new AuthenticationError(
          `OAuth2 token request failed: ${errorData.error_description || errorData.error}`,
          'TOKEN_REQUEST_FAILED',
          response.status >= 500,  // Retry on server errors
          errorData.error  // RFC 6749 error code
        );
      }

      const data = await response.json() as {
        access_token: string;
        token_type: string;
        expires_in: number;
        scope?: string;
      };

      const token: StoredToken = {
        accessToken: data.access_token,
        tokenType: data.token_type || 'Bearer',
        expiresAt: new Date(Date.now() + (data.expires_in * 1000)),
        scopes: data.scope?.split(' '),
        audience: this.config.audience
      };

      await this.tokenStorage.store(this.serverId, token);

      // Update token info for debugging
      this.tokenInfo = {
        type: 'oauth2',
        expiresAt: token.expiresAt,
        scopes: token.scopes,
        audience: token.audience
      };

      // Log token acquisition using existing logger
      logEvent('info', 'auth:token_acquired', {
        server: this.serverId,
        expiresIn: data.expires_in
      });

    } catch (error) {
      if (error instanceof AuthenticationError) {
        throw error;
      }

      throw new AuthenticationError(
        `Failed to refresh token: ${(error as Error).message}`,
        'REFRESH_FAILED'
      );
    }
  }

  isExpired(): boolean {
    // Check if we have a token and if it's about to expire (5 min buffer)
    const token = this.tokenInfo;
    if (!token || !token.expiresAt) return true;

    const bufferMs = 5 * 60 * 1000; // 5 minutes
    return token.expiresAt.getTime() < Date.now() + bufferMs;
  }

  async validateAudience(audience?: string): Promise<void> {
    if (!audience) return;

    const token = await this.tokenStorage.retrieve(this.serverId);
    if (!token) {
      throw new AuthenticationError(
        'No token available for audience validation',
        'TOKEN_NOT_FOUND'
      );
    }

    if (token.audience !== audience) {
      throw new AuthenticationError(
        `Token audience mismatch. Expected: ${audience}, Got: ${token.audience}`,
        'INVALID_AUDIENCE'
      );
    }
  }

  getTokenInfo(): TokenInfo | null {
    return this.tokenInfo;
  }

  private isTokenExpired(token: StoredToken): boolean {
    const bufferMs = 5 * 60 * 1000; // 5 minutes
    return token.expiresAt.getTime() < Date.now() + bufferMs;
  }
}
```

### 7. Configuration Schema Extension (Not Replacement)

```typescript
// packages/mcp/src/config.ts - EXTEND existing schemas, don't replace
import { z } from 'zod';
import { TargetServerSchema } from './config.js';  // Import existing

// Auth schemas
const NoAuthSchema = z.object({
  type: z.literal('none')
});

const BearerAuthSchema = z.object({
  type: z.literal('bearer'),
  token: z.string().min(1)
});

const OAuth2ClientCredentialsSchema = z.object({
  type: z.literal('oauth2-client'),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  tokenEndpoint: z.string().url(),
  audience: z.string().optional(),
  scopes: z.array(z.string()).optional()
});

const OAuth2AuthCodeSchema = z.object({
  type: z.literal('oauth2-code'),
  clientId: z.string().min(1),
  authorizationEndpoint: z.string().url(),
  tokenEndpoint: z.string().url(),
  redirectUri: z.string().url(),
  scopes: z.array(z.string()).optional()
});

export const AuthConfigSchema = z.discriminatedUnion('type', [
  NoAuthSchema,
  BearerAuthSchema,
  OAuth2ClientCredentialsSchema,
  OAuth2AuthCodeSchema
]);

// Transport schemas
const RetryConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxAttempts: z.number().min(1).max(10).default(3),
  baseDelayMs: z.number().min(100).max(10000).default(1000)
});

const StdioTransportSchema = z.object({
  type: z.literal('stdio'),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional()
});

const SSETransportSchema = z.object({
  type: z.literal('sse'),
  url: z.string().url(),
  auth: AuthConfigSchema.optional(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().min(1000).max(300000).optional(),
  retryConfig: RetryConfigSchema.optional()
});

const WebSocketTransportSchema = z.object({
  type: z.literal('websocket'),
  url: z.string().url().regex(/^wss?:\/\//),
  auth: AuthConfigSchema.optional(),
  reconnectConfig: z.object({
    enabled: z.boolean().default(true),
    maxAttempts: z.number().default(5),
    delayMs: z.number().default(1000)
  }).optional()
});

export const TransportConfigSchema = z.discriminatedUnion('type', [
  StdioTransportSchema,
  SSETransportSchema,
  WebSocketTransportSchema
]);

// EXTEND existing TargetServerSchema instead of creating new
export const ExtendedTargetServerSchema = TargetServerSchema.extend({
  // Add new fields to existing schema
  transport: TransportConfigSchema.optional(),
  auth: AuthConfigSchema.optional()
}).refine(
  (data) => data.command || data.transport,
  { message: "Server must have either 'command' (legacy) or 'transport' configuration" }
);

// The existing TargetServerSchema already has:
// - name: string
// - command?: string
// - args?: string[]
// - env?: Record<string, string>
// We're just adding transport and auth support
```

### 8. Integration with MCPProxy

```typescript
// packages/mcp/src/index.ts - Updated MCPProxy class
import { TransportFactory } from './transports/transport-factory.js';
import { MemoryTokenStorage } from './auth/implementations/memory-token-storage.js';
import { logEvent, logError } from './logger.js';  // Use existing logger

export class MCPProxy {
  private transportFactory: TransportFactory;

  constructor(config: ProxyConfig) {
    // ... existing constructor code ...

    // Initialize transport factory with token storage
    const tokenStorage = new MemoryTokenStorage();
    this.transportFactory = new TransportFactory(tokenStorage);
  }

  private async connectToTargetServers() {
    const connectionPromises = this._normalizedServers.map(
      async (targetServer) => {
        try {
          // Use existing logger pattern
          logEvent('info', 'server:connect_start', {
            name: targetServer.name,
            transportType: targetServer.transport?.type || 'stdio'
          });

          const client = new Client({
            name: `proxy-client-${targetServer.name}`,
            version: '1.0.0',
          });

          // Use transport factory to create appropriate transport
          const transport = await this.transportFactory.create(targetServer);

          await client.connect(transport);

          this.connectedServers.set(targetServer.name, targetServer);
          this._clients.set(targetServer.name, client);

          console.error(`[proxy] Connected to: ${targetServer.name}`);
          logEvent('info', 'server:connect_success', {
            name: targetServer.name,
            transportType: targetServer.transport?.type || 'stdio'
          });

          return { name: targetServer.name, status: 'connected' as const };
        } catch (error) {
          console.error(
            `[proxy] Failed to connect to ${targetServer.name}:`,
            error
          );

          // Use existing logger with structured context
          if (error instanceof AuthenticationError) {
            logError('auth:failed', error, {
              name: targetServer.name,
              code: error.code
            });
          } else {
            logError('server:connection_failed', error, {
              name: targetServer.name,
              transport: targetServer.transport?.type || 'stdio'
            });
          }

          return { name: targetServer.name, status: 'failed' as const, error };
        }
      }
    );

    const results = await Promise.allSettled(connectionPromises);
    const summary = results.map((r) =>
      r.status === 'fulfilled' ? r.value : r.reason,
    );
    logEvent('info', 'server:connect_summary', { summary });
  }
}
```

## Testing Implementation

```typescript
// packages/mcp/src/transports/__tests__/sse-transport.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEClientTransport } from '../implementations/sse-client-transport.js';
import { OAuth2ClientCredentialsProvider } from '../../auth/implementations/oauth2-client-credentials.js';
import { MemoryTokenStorage } from '../../auth/implementations/memory-token-storage.js';

// Mock EventSource
vi.mock('eventsource', () => {
  return {
    default: vi.fn().mockImplementation((url: string, options: any) => ({
      url,
      readyState: 0, // CONNECTING
      addEventListener: vi.fn(),
      close: vi.fn(),
      onopen: null,
      onmessage: null,
      onerror: null,
      // Simulate connection after creation
      simulateOpen: function() {
        this.readyState = 1; // OPEN
        if (this.onopen) this.onopen();
      },
      simulateMessage: function(data: any) {
        if (this.onmessage) {
          this.onmessage({ data: JSON.stringify(data) });
        }
      },
      simulateError: function() {
        this.readyState = 2; // CLOSED
        if (this.onerror) this.onerror(new Error('Connection failed'));
      }
    }))
  };
});

describe('SSEClientTransport', () => {
  let transport: SSEClientTransport;
  let authProvider: OAuth2ClientCredentialsProvider;
  let tokenStorage: MemoryTokenStorage;
  let mockEventSource: any;

  beforeEach(() => {
    // Mock fetch
    global.fetch = vi.fn();

    // Reset environment
    process.env.NODE_ENV = 'test';

    tokenStorage = new MemoryTokenStorage();
    authProvider = new OAuth2ClientCredentialsProvider(
      {
        type: 'oauth2-client',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        tokenEndpoint: 'https://auth.example.com/token',
        audience: 'https://api.example.com'
      },
      'test-server',
      tokenStorage
    );

    transport = new SSEClientTransport(
      'test-server',
      {
        type: 'sse',
        url: 'https://api.example.com/mcp'
      },
      authProvider
    );
  });

  it('should obtain token on first request', async () => {
    // Mock token endpoint
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'test-token',
        token_type: 'Bearer',
        expires_in: 3600
      })
    });

    // Mock MCP endpoint
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: {},
        id: 1
      })
    });

    await transport.start();
    await transport.send({
      jsonrpc: '2.0',
      method: 'test',
      params: {},
      id: 1
    });

    // Verify token was obtained
    expect(global.fetch).toHaveBeenCalledWith(
      'https://auth.example.com/token',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('grant_type=client_credentials')
      })
    );

    // Verify bearer token was used
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.example.com/mcp',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Bearer test-token'
        })
      })
    );
  });

  it('should refresh expired token', async () => {
    // Store expired token
    await tokenStorage.store('test-server', {
      accessToken: 'expired-token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() - 1000), // Expired
      audience: 'https://api.example.com'
    });

    // Mock refresh
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'new-token',
        token_type: 'Bearer',
        expires_in: 3600
      })
    });

    const headers = await authProvider.getAuthHeaders();

    expect(headers['Authorization']).toBe('Bearer new-token');
  });

  it('should validate audience', async () => {
    await tokenStorage.store('test-server', {
      accessToken: 'test-token',
      tokenType: 'Bearer',
      expiresAt: new Date(Date.now() + 3600000),
      audience: 'https://api.example.com'
    });

    // Should not throw
    await authProvider.validateAudience('https://api.example.com');

    // Should throw for wrong audience
    await expect(
      authProvider.validateAudience('https://wrong.example.com')
    ).rejects.toThrow('Token audience mismatch');
  });

  it('should handle 401 with token refresh', async () => {
    // First request returns 401
    (global.fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized'
    });

    // Token refresh
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        access_token: 'refreshed-token',
        token_type: 'Bearer',
        expires_in: 3600
      })
    });

    // Retry succeeds
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        jsonrpc: '2.0',
        result: { success: true },
        id: 1
      })
    });

    await transport.send({
      jsonrpc: '2.0',
      method: 'test',
      params: {},
      id: 1
    });

    // Should have called fetch 3 times
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
```

## Implementation Notes

### EventSource Browser vs Node.js

**Critical Difference**: Browser EventSource cannot set custom headers!

```typescript
// Browser EventSource - headers ignored
new EventSource(url, { headers: { 'Authorization': 'Bearer token' } }); // ❌ Won't work

// Node.js EventSource (eventsource package) - headers work
import EventSource from 'eventsource';
new EventSource(url, { headers: { 'Authorization': 'Bearer token' } }); // ✅ Works
```

**Solution for Browser Compatibility**:
```typescript
// Add token as query parameter for browser
const sseUrl = new URL(config.url);
if (typeof window !== 'undefined') {
  // Browser environment - use query param
  sseUrl.searchParams.set('token', token);
} else {
  // Node.js - can use headers
  options.headers = { 'Authorization': `Bearer ${token}` };
}
```

### Message Correlation

**UUID Generation**:
```typescript
import { v4 as uuidv4 } from 'uuid';

// Generate correlation ID for each request
const correlationId = uuidv4();
message.id = message.id || correlationId;
```

### Security Considerations

**HTTPS Validation**:
```typescript
// Enforce HTTPS in production
if (process.env.NODE_ENV === 'production' && !url.startsWith('https://')) {
  throw new Error('OAuth endpoints must use HTTPS');
}

// Allow HTTP for localhost in development
if (process.env.NODE_ENV === 'development' && url.includes('localhost')) {
  // Allow HTTP for local testing
}
```

## File Structure (With Central types/ Folder)

```
packages/mcp/src/
├── types/                       # SHARED types across domains
│   ├── auth.types.ts           # AuthConfig discriminated unions
│   ├── transport.types.ts      # TransportConfig, SSEConfig
│   ├── server.types.ts         # ExtendedTargetServer type
│   └── index.ts                # Re-export all shared types
├── auth/
│   ├── interfaces/              # Domain-specific interfaces
│   │   ├── auth-provider.interface.ts  # IAuthProvider
│   │   └── token-storage.interface.ts  # ITokenStorage
│   ├── implementations/         # Concrete implementations
│   │   ├── no-auth-provider.ts
│   │   ├── bearer-token-provider.ts
│   │   ├── oauth2-client-credentials.ts
│   │   └── memory-token-storage.ts      (MVP)
│   ├── errors/                  # Domain-specific errors
│   │   └── authentication-error.ts
│   └── index.ts                 # Re-exports auth module
├── transports/
│   ├── implementations/         # Transport implementations
│   │   ├── stdio-client-transport.ts     (NEW - extracted reusable parts)
│   │   └── sse-client-transport.ts       (NEW - with MVP reconnect)
│   # NOTE: PrefixedStdioClientTransport remains in src/index.ts unchanged
│   ├── errors/                  # Domain-specific errors
│   │   └── transport-error.ts
│   ├── transport-factory.ts    # Factory for creating transports
│   └── index.ts                 # Re-exports transport module
├── config.ts                    # EXTENDED with schemas from types/
└── index.ts                     # MCPProxy with transport factory
```

**Key Principle**: Types used across domains (AuthConfig, TransportConfig, ExtendedTargetServer) go in `types/`. Domain-specific interfaces (IAuthProvider, ITokenStorage) stay in their domains
```

## Migration Guide

### From Stdio to HTTP

```json
// Before (stdio)
{
  "servers": {
    "analyzer": {
      "command": "docker",
      "args": ["run", "-i", "analyzer:v1"],
      "env": {
        "API_KEY": "${ANALYZER_KEY}"
      }
    }
  }
}

// After (SSE with OAuth)
{
  "servers": {
    "analyzer": {
      "transport": {
        "type": "sse",
        "url": "https://analyzer.cloud/mcp",
        "auth": {
          "type": "oauth2-client",
          "clientId": "mcp-funnel",
          "clientSecret": "${ANALYZER_CLIENT_SECRET}",
          "tokenEndpoint": "https://analyzer.cloud/oauth/token",
          "audience": "https://analyzer.cloud"
        }
      }
    }
  }
}
```

## Security Checklist

- [ ] Client secrets stored in environment variables only
- [ ] Tokens never logged or exposed in errors
- [ ] Audience validation implemented
- [ ] Token expiry checked before use
- [ ] Automatic refresh on 401 responses
- [ ] Secure storage for Phase 2 (keychain)
- [ ] TLS/HTTPS enforced for OAuth endpoints
- [ ] Rate limiting respected
- [ ] Scopes minimized to required permissions

## Benefits of This Architecture

1. **Clean Separation**: Transport, auth, and storage are independent
2. **Extension Points**: Easy to add new auth methods or transports
3. **Type Safety**: Full TypeScript types with Zod validation
4. **Testable**: All components can be mocked and tested independently
5. **Progressive Enhancement**: Start with MVP, upgrade to production features
6. **MCP Compliant**: Follows authorization specification exactly
7. **Backwards Compatible**: Existing stdio configs work unchanged

This architecture ensures OAuth support integrates naturally with MCP Funnel's existing design while providing clear extension points for future enhancements.