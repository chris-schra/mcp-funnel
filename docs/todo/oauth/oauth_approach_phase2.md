# OAuth Phase 2: Enhanced Security & User Delegation Implementation

## Implementation Status Overview

### Phase 2.1: OAuth2 Authorization Code Flow
**Server Integration:**
- [x] OAuth callback route in packages/server (`/api/oauth/callback`)
- [x] Hono server integration with MCPProxy
- [x] HTML success/error pages with auto-close
- [x] Route added to main server (`app.route('/api/oauth', oauthRoute)`)

**OAuth2AuthCodeProvider:**
- [x] Complete RFC 6749 + RFC 7636 PKCE implementation
- [x] PKCE challenge/verifier generation
- [x] Browser authorization URL output (console-based)
- [x] State management and validation
- [x] Token exchange implementation
- [x] **Fix broken unit tests (syntax errors)** ✅ COMPLETED

**MCPProxy Integration:**
- [x] `completeOAuthFlow` method implemented
- [x] Factory method for OAuth2AuthCodeProvider creation
- [x] Support for both connected/disconnected servers
- [x] Automatic reconnection after OAuth completion

### Phase 2.2: Secure Token Storage (Keychain)
**Implementation:**
- [x] KeychainTokenStorage class with OS commands
- [x] Cross-platform support (macOS security, Windows cmdkey, Linux files)
- [x] TokenStorageFactory with auto-detection
- [x] Graceful fallback to memory in CI/test environments
- [x] **Fix failing unit tests (mocking issues)** ✅ COMPLETED

**Integration:**
- [x] Used in OAuth2ClientCredentialsProvider
- [x] Used in OAuth2AuthCodeProvider
- [x] Environment-based selection logic

### Phase 2.3: WebSocket Transport
**Client-side Implementation:**
- [ ] **WebSocket client transport class (`websocket-client-transport.ts`)**
- [ ] **WebSocket transport type in configuration schemas**
- [ ] **Integration in transport factory (`createTransportImplementation`)**
- [ ] **Auth provider integration for WebSocket**
- [ ] **Reconnection logic (reuse from SSE patterns)**

**Server-side (Ready):**
- [x] WebSocketServer setup in packages/server
- [x] WebSocketManager for handling connections
- [x] `/ws` endpoint configured
- [x] Tool execution over WebSocket implemented

### Phase 2.4: Security Enhancements
**Audit Logging:**
- [x] OAuth event logging in existing logger
- [x] Authentication attempt tracking
- [x] Token refresh logging

**Rate Limiting:**
- [ ] **Simple in-memory rate limiter implementation**
- [ ] **Integration with auth providers**

### Phase 2.5: Testing & Documentation
**Unit Tests:**
- [x] OAuth2AuthCodeProvider tests ✅ COMPLETED
- [x] KeychainTokenStorage tests ✅ COMPLETED
- [ ] **WebSocket client transport tests**
- [ ] **Integration tests for complete OAuth flow**

**Quality Issues:**
- [x] **Fix TypeScript/ESLint validation errors** ✅ COMPLETED
- [x] **Fix console.log violations in OAuth2AuthCodeProvider** ✅ COMPLETED
- [x] **Fix require() import violations** ✅ COMPLETED

**Summary:**
- **Completed:** OAuth2 authorization code flow implementation, keychain storage, server infrastructure, unit tests, quality fixes
- **Remaining:** WebSocket client transport, rate limiting
- **Critical blockers:** None - all test and validation issues resolved, ready for WebSocket implementation

## Your responsibility
**BEFORE** creating tasks, keep in mind:
- you need to assess the current state first
- make sure to detect existing packages (recursively, use a scan for package.json, excluding **/node_modules/**)
  to understand the repo first, then check relevant files for focus.
- Remember: you are the supervisor and at this stage your main responsibility is to make sure that the implementation
  is correct. Your context is "reserved" to be bloated with useful input tokens, so go ahead, use code-reasoning MCP to get a full understanding of current implementation status.
- You **MUST** make sure that scope is clear, that there will be no duplications implemented,
  and that the tasks are small enough to be handled by an engineer.
- Your job is **NOT** to please the user, but to support them that beginning with an epic, throughout the implementation
  everything is clear, small enough, and that the implementation is correct and well-aligned.
- Your job **IS** to ask questions to the user to clarify the scope and to identify possible blockers and risks.

## CRITICAL:

- **NEVER** touch tsconfig.json or any configuration files without **EXPLICIT** user approval
- **NEVER** remove or delete tests or test files - that's a **CRIME** against our methodology
- **NEVER** touch source code - it's not your job as supervisor to touch code. **You have subagent workers for that.**
- **NEVER** modify existing transport (PrefixedStdioClientTransport) - create new abstractions alongside it

## Before starting

**BEFORE** starting a new phase, you **MUST** create tasks that are optimized for parallel work,
so it should be **NO** work on the same files in parallel.
Then start instances of subagent worker IN PARALLEL to work on the tasks and coordinate them.
Use as many PARALLEL worker instances as useful - CONSIDER dependencies so do NOT launch workers
in parallel that have dependencies that are not implemented or will be worked on in other tasks.

To start parallel subagent workers, you **MUST** send a single message with multiple Task tool calls.

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

### Phase 2.1: OAuth2 Authorization Code Flow ✅ **COMPLETED**

**BEFORE** starting this phase:
- [ ] You **MUST** tick the checklist boxes for Phase 1 (OAuth Client Credentials)
- [ ] You **MUST** make sure that all files modified by the workers and this file have been committed
- [ ] **Fix critical blockers:** OAuth2 authorization code provider test syntax errors

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

**DO NOT** proceed to next phase until:
- [x] **Fix OAuth2 authorization code provider test syntax errors** ✅ COMPLETED
- [x] `yarn validate` passes WITHOUT ANY ERRORS OR ISSUES ✅ COMPLETED
- [x] `yarn test` passes WITHOUT ANY ERRORS OR ISSUES ✅ COMPLETED
- [x] You did a thorough review of all code changes using code-reasoning tool ✅ COMPLETED

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

### Phase 2.2: Secure Token Storage (Keychain) ✅ **COMPLETED**

**BEFORE** starting this phase:
- [ ] You **MUST** tick the checklist boxes for previous phase
- [ ] You **MUST** make sure that all files modified by the workers and this file have been committed
- [ ] **Fix critical blockers:** Keychain token storage test failures (mocking issues)

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

**DO NOT** proceed to next phase until:
- [x] **Fix keychain token storage test failures (mocking issues)** ✅ COMPLETED
- [x] `yarn validate` passes WITHOUT ANY ERRORS OR ISSUES ✅ COMPLETED
- [x] `yarn test` passes WITHOUT ANY ERRORS OR ISSUES ✅ COMPLETED
- [x] You did a thorough review of all code changes using code-reasoning tool ✅ COMPLETED

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

### Phase 2.3: WebSocket Transport ❌ **NOT STARTED**

**BEFORE** starting this phase:
- [ ] You **MUST** tick the checklist boxes for previous phase
- [ ] You **MUST** make sure that all files modified by the workers and this file have been committed

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

**DO NOT** proceed to next phase until:
- [ ] **Implement WebSocket client transport class (`websocket-client-transport.ts`)**
- [ ] **Add WebSocket transport type to configuration schemas**
- [ ] **Integrate WebSocket transport into transport factory**
- [ ] **Add WebSocket client transport tests**
- [ ] `yarn validate` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] You did a thorough review of all code changes using code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

### Phase 2.4: Security Enhancements ❌ **NOT STARTED**

**BEFORE** starting this phase:
- [ ] You **MUST** tick the checklist boxes for previous phase
- [ ] You **MUST** make sure that all files modified by the workers and this file have been committed

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

**DO NOT** proceed to next phase until:
- [ ] **Implement simple in-memory rate limiter**
- [ ] **Integrate rate limiting with auth providers**
- [ ] `yarn validate` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] You did a thorough review of all code changes using code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

### Phase 2.5: Testing & Documentation ❌ **PARTIALLY STARTED**

**BEFORE** starting this phase:
- [ ] You **MUST** tick the checklist boxes for previous phase
- [ ] You **MUST** make sure that all files modified by the workers and this file have been committed
- [ ] **Fix critical blockers:** All validation errors and test failures from previous phases

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

**DO NOT** proceed to next phase until:
- [ ] **Add WebSocket client transport tests**
- [ ] **Add integration tests for complete OAuth flow**
- [ ] **Fix all TypeScript/ESLint validation errors**
- [ ] **Fix console.log violations in OAuth2AuthCodeProvider**
- [ ] **Fix require() import violations**
- [ ] `yarn validate` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] You did a thorough review of all code changes using code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

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