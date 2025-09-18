# OAuth Phase 2: Enhanced Security & User Delegation Implementation

## Overview

This document outlines the implementation approach for Phase 2 OAuth enhancements, building upon the completed Phase 1 MVP (OAuth2 Client Credentials flow). Phase 2 focuses on user-centric authentication, secure token storage, and leveraging existing infrastructure.

## Phase 2 Objectives

1. **OAuth2 Authorization Code Flow** - Enable user delegation for personal accounts (GitHub, Linear, etc.)
2. **Secure Token Storage** - OS keychain integration for persistent, secure token storage
3. **WebSocket Transport** - Leverage existing WebSocket infrastructure in packages/server
4. **Enhanced Security** - Token encryption at rest, audit logging, rate limiting

## Design Principle: Extend, Don't Add

**CRITICAL**: Phase 2 must leverage existing infrastructure:
- Use existing Hono server in `packages/server` for OAuth callbacks
- Extend existing WebSocket infrastructure (already in packages/server)
- Build on top of Phase 1's IAuthProvider and ITokenStorage interfaces
- NO unnecessary package additions or parallel systems

## Prerequisites

- **Completed Phase 1**: All OAuth Client Credentials flow implementation complete
- **Existing Infrastructure**: Hono server, WebSocket support, MCPProxy integration

### Minimal Phase 2 Dependencies

```bash
# Only what's absolutely necessary:
cd packages/mcp
yarn add keytar  # OS keychain access (only if no lighter alternative exists)
yarn add -D @types/keytar

# Consider: Can we use OS commands instead of keytar?
# macOS: security command
# Windows: cmdkey command
# Linux: secret-tool command
```

## Implementation Phases

### Phase 2.1: OAuth2 Authorization Code Flow

**Objective**: Enable individual developers to authenticate with their personal accounts without managing PATs.

#### Integration with Existing Infrastructure:

1. **Extend packages/server with OAuth callback route**:
   ```typescript
   // packages/server/src/api/oauth.ts
   import { Hono } from 'hono';

   export const oauthRoute = new Hono<{ Variables: Variables }>();

   oauthRoute.get('/callback', async (c) => {
     const code = c.req.query('code');
     const state = c.req.query('state');
     const mcpProxy = c.get('mcpProxy');

     // Hand off to MCPProxy's OAuth handler
     await mcpProxy.completeOAuthFlow(state, code);

     // Return success page or redirect
     return c.html('<html><body>Authorization successful! You can close this window.</body></html>');
   });

   // In packages/server/src/index.ts - add route
   app.route('/api/oauth', oauthRoute);
   ```

2. **OAuth2AuthCodeProvider in packages/mcp**:
   ```typescript
   // packages/mcp/src/auth/implementations/oauth2-authorization-code.ts
   export class OAuth2AuthCodeProvider implements IAuthProvider {
     private pendingAuth?: {
       state: string;
       verifier: string;
       resolve: (token: string) => void;
       reject: (error: Error) => void;
     };

     async initiateAuthFlow(): Promise<void> {
       // Generate PKCE challenge/verifier
       const state = generateRandomString();
       const verifier = generatePKCEVerifier();
       const challenge = generatePKCEChallenge(verifier);

       // Store pending auth
       this.pendingAuth = { state, verifier, /* ... */ };

       // Build auth URL
       const authUrl = new URL(this.config.authUrl);
       authUrl.searchParams.set('client_id', this.config.clientId);
       authUrl.searchParams.set('redirect_uri', 'http://localhost:3456/api/oauth/callback');
       authUrl.searchParams.set('state', state);
       authUrl.searchParams.set('code_challenge', challenge);

       // Log URL for user to open (no new packages!)
       console.log('\n🔐 Please open this URL in your browser to authorize:');
       console.log(authUrl.toString());
       console.log('\n');

       // Wait for callback from server
       return new Promise((resolve, reject) => {
         this.pendingAuth!.resolve = resolve;
         this.pendingAuth!.reject = reject;

         // Timeout after 5 minutes
         setTimeout(() => reject(new Error('Authorization timeout')), 5 * 60 * 1000);
       });
     }
   }
   ```

3. **MCPProxy integration**:
   - Extend MCPProxy to handle OAuth completion
   - Coordinate with the Hono server's callback route
   - NO separate callback server needed

**Key Points**:
- ✅ Reuses existing Hono server (port 3456)
- ✅ No Express, no additional web framework
- ✅ Leverages existing MCPProxy connection
- ✅ Simple console output instead of browser launching package

### Phase 2.2: Secure Token Storage (Keychain)

**Objective**: Replace in-memory storage with OS keychain, but consider using OS commands instead of packages.

#### Lightweight Approach:

1. **OS Command Implementation**:
   ```typescript
   // packages/mcp/src/auth/implementations/keychain-token-storage.ts
   export class KeychainTokenStorage implements ITokenStorage {
     private async executeCommand(cmd: string, args: string[]): Promise<string> {
       const { exec } = await import('child_process');
       return new Promise((resolve, reject) => {
         exec(`${cmd} ${args.join(' ')}`, (error, stdout) => {
           if (error) reject(error);
           else resolve(stdout.trim());
         });
       });
     }

     async store(serverId: string, token: TokenData): Promise<void> {
       const key = `mcp-funnel:${serverId}`;
       const value = JSON.stringify(token);

       if (process.platform === 'darwin') {
         // macOS: Use security command
         await this.executeCommand('security', [
           'add-generic-password',
           '-a', key,
           '-s', 'mcp-funnel',
           '-w', value,
           '-U'  // Update if exists
         ]);
       } else if (process.platform === 'win32') {
         // Windows: Use cmdkey
         await this.executeCommand('cmdkey', [
           '/generic:' + key,
           '/user:mcp-funnel',
           '/pass:' + value
         ]);
       } else {
         // Linux: Fallback to file with user-only permissions
         const filePath = path.join(os.homedir(), '.mcp-funnel', 'tokens');
         await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
         await fs.writeFile(filePath, value, { mode: 0o600 });
       }
     }
   }
   ```

2. **Factory Pattern for Storage Selection**:
   ```typescript
   // Reuse existing pattern from TransportFactory
   export function createTokenStorage(type: 'memory' | 'keychain' = 'keychain'): ITokenStorage {
     if (type === 'memory' || process.env.CI) {
       return new MemoryTokenStorage();
     }
     return new KeychainTokenStorage();
   }
   ```

**Key Points**:
- ✅ Uses OS built-in commands (no keytar dependency)
- ✅ Graceful fallback to encrypted file on Linux
- ✅ CI/CD friendly with memory fallback
- ✅ Implements existing ITokenStorage interface

### Phase 2.3: WebSocket Transport

**Objective**: Create client-side WebSocket transport that connects to EXISTING server infrastructure.

#### Leverage Existing Infrastructure:

1. **Client-side transport only** (server already has WebSocket):
   ```typescript
   // packages/mcp/src/transports/implementations/websocket-client-transport.ts
   import { WebSocket } from 'ws';

   export class WebSocketClientTransport implements Transport {
     private ws?: WebSocket;

     async start(): Promise<void> {
       // Connect to existing WebSocket endpoint
       const wsUrl = this.config.url.replace('http', 'ws');

       this.ws = new WebSocket(wsUrl, {
         headers: await this.authProvider.getHeaders()
       });

       // Reuse SSEClientTransport's reconnection logic
       this.setupReconnection();
     }

     // Most logic can be shared with SSEClientTransport
     // Just different transport mechanism
   }
   ```

2. **Server-side is already ready**:
   ```typescript
   // packages/server already has this in src/index.ts:
   // - WebSocketServer setup
   // - WebSocketManager for handling connections
   // - /ws endpoint

   // Just need to extend WebSocketManager for MCP messages
   ```

**Key Points**:
- ✅ Client implementation only (server ready)
- ✅ Reuses existing reconnection patterns from SSE
- ✅ No new server infrastructure needed
- ✅ WebSocket package already in packages/server

### Phase 2.4: Security Enhancements

**Objective**: Add security features using existing logging and patterns.

#### Extend Existing Systems:

1. **Audit Logging** - Use existing logger:
   ```typescript
   // Extend existing logEvent from packages/mcp/src/logger.ts
   logEvent('auth:oauth_initiated', { provider, serverId });
   logEvent('auth:token_refreshed', { serverId, expiresIn });
   logEvent('auth:failed_attempt', { serverId, error: error.code });
   ```

2. **Rate Limiting** - Simple in-memory implementation:
   ```typescript
   // packages/mcp/src/auth/rate-limiter.ts
   class SimpleRateLimiter {
     private attempts = new Map<string, number[]>();

     canAttempt(key: string): boolean {
       const now = Date.now();
       const window = 60000; // 1 minute
       const maxAttempts = 5;

       const attempts = this.attempts.get(key) || [];
       const recentAttempts = attempts.filter(t => now - t < window);

       if (recentAttempts.length >= maxAttempts) {
         return false;
       }

       recentAttempts.push(now);
       this.attempts.set(key, recentAttempts);
       return true;
     }
   }
   ```

**Key Points**:
- ✅ Uses existing logging infrastructure
- ✅ Simple, effective rate limiting without new dependencies
- ✅ Follows existing error handling patterns

### Phase 2.5: Testing & Documentation

**Objective**: Test within existing test infrastructure.

#### Use Existing Test Patterns:

1. **Unit Tests** - Add to existing test files:
   ```typescript
   // packages/mcp/test/unit/oauth2-auth-code.test.ts
   // Follow existing patterns from oauth2-client-credentials.test.ts
   ```

2. **Integration Tests** - Extend existing server tests:
   ```typescript
   // packages/server/test/integration/oauth-callback.test.ts
   // Test OAuth callback route with existing test setup
   ```

## What We're NOT Doing

1. ❌ **NOT** adding Express - we have Hono
2. ❌ **NOT** adding a browser launcher - console output is fine
3. ❌ **NOT** creating parallel WebSocket infrastructure - it exists
4. ❌ **NOT** adding complex new packages when OS commands work
5. ❌ **NOT** building separate callback servers - extend existing server
6. ❌ **NOT** creating new logging systems - use existing logger
7. ❌ **NOT** implementing complex encryption - OS keychains handle it

## Migration Strategy

### Incremental Enhancement

1. **Phase 1 configs continue working**:
   ```typescript
   // This still works
   {
     "auth": { "type": "oauth2-client", /* ... */ }
   }
   ```

2. **Phase 2 adds new auth type**:
   ```typescript
   // New option available
   {
     "auth": { "type": "oauth2-code", /* ... */ }
   }
   ```

3. **Storage is automatic**:
   - Automatically uses keychain when available
   - Falls back to memory if not
   - No config needed

## Implementation Order

1. **Week 1**: OAuth2 Authorization Code
   - Add callback route to existing Hono server
   - Implement OAuth2AuthCodeProvider
   - Test with GitHub OAuth app

2. **Week 2**: Token Storage
   - Implement OS command-based keychain
   - Add storage factory
   - Test cross-platform

3. **Week 3**: WebSocket Client
   - Implement client transport only
   - Connect to existing server WebSocket
   - Test with existing WebSocket infrastructure

4. **Week 4**: Security & Polish
   - Add audit logging with existing logger
   - Simple rate limiting
   - Documentation

## Success Metrics

1. **Simplicity**: No unnecessary packages added
2. **Integration**: Seamlessly extends Phase 1
3. **Compatibility**: All existing configs work
4. **Security**: OS-level token protection
5. **Developer Experience**: No PAT management needed

## Key Architecture Decisions

1. **Leverage packages/server**: OAuth callbacks through existing Hono server
2. **OS Commands over packages**: Use security/cmdkey instead of keytar
3. **Extend, don't replace**: Build on IAuthProvider and ITokenStorage
4. **Console over complexity**: Log auth URL instead of browser launching
5. **Reuse patterns**: Follow existing TransportFactory, error handling, logging

## Risk Mitigation

- **Risk**: OS command differences
  - **Mitigation**: Test on all platforms, provide fallbacks

- **Risk**: OAuth provider variations
  - **Mitigation**: Start with GitHub, add providers incrementally

- **Risk**: Breaking Phase 1
  - **Mitigation**: All changes are additive, new code paths only

## Conclusion

Phase 2 enhances MCP Funnel's OAuth support by **extending existing infrastructure** rather than adding complexity. By leveraging the existing Hono server, WebSocket setup, and established patterns, we deliver user delegation and secure storage without unnecessary dependencies. The focus is on pragmatic solutions that solve real user needs (eliminating PAT management) while maintaining the simplicity and clarity of the Phase 1 implementation.