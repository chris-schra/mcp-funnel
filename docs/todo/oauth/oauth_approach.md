# OAuth & SSE Transport Implementation Approach

## Environment Setup Requirements

### Prerequisites
- **Node.js**: v18.0.0+ (required for native fetch API)
- **TypeScript**: v5.0.0+
- **Yarn**: v1.22.0+ (workspace support)

### Development Environment
```bash
# Install dependencies
yarn install

# Add OAuth dependencies to MCP package
cd packages/mcp
yarn add eventsource uuid
yarn add -D @types/eventsource @types/uuid

# Environment variables for testing
export NODE_ENV=development  # Allows non-HTTPS for local testing
export TEST_OAUTH_CLIENT_ID=test-client
export TEST_OAUTH_CLIENT_SECRET=test-secret
```

## Security Validation Checklist

### HTTPS Enforcement
- [ ] All OAuth token endpoints use HTTPS in production
- [ ] All MCP SSE endpoints use HTTPS in production
- [ ] Development mode allows HTTP for localhost only
- [ ] Certificate validation enabled (no self-signed in production)

### Token Security
- [ ] Tokens never logged in any log level
- [ ] Token sanitization in error messages
- [ ] Tokens cleared from memory on process exit
- [ ] No token persistence to disk in MVP

### Authentication Validation
- [ ] Audience claim validation implemented
- [ ] Token expiry checked with 5-minute buffer
- [ ] Scope validation against requested operations
- [ ] Client credentials stored in environment variables only

### Error Handling
- [ ] OAuth2 error codes properly mapped (RFC 6749)
- [ ] No sensitive data in error messages
- [ ] Retry logic only for retryable errors (5xx, network)
- [ ] Circuit breaker for repeated auth failures

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
- **NEVER** modify the existing PrefixedStdioClientTransport class directly - keep it unchanged for backwards compatibility
- **ALLOWED**: Extract reusable logic into a new StdioClientTransport that implements SDK Transport interface

## Before starting

**BEFORE** starting a new phase, you **MUST** create tasks that are optimized for parallel work,
so it should be **NO** work on the same files in parallel.
Then start instances of subagent worker IN PARALLEL to work on the tasks and coordinate them.
Use as many PARALLEL worker instances as useful - CONSIDER dependencies so do NOT launch workers
in parallel that have dependencies that are not implemented or will be worked on in other tasks.

To start parallel subagent workers, you **MUST** send a single message with multiple Task tool calls.

## Iteration Plan:

### Phase 1: Interfaces & Types

- **NO CUSTOM TRANSPORT INTERFACE** - Use MCP SDK's existing Transport from '@modelcontextprotocol/sdk/types.js'
- **Follow I-prefix convention**: IAuthProvider, ITokenStorage (matching registry pattern)
- **EXTEND existing types**: Don't create new ServerConfig - extend TargetServerSchema from config.ts
- AuthConfig types (none, bearer, oauth2-client, oauth2-code) as discriminated unions
- TransportConfig to extend existing transport field in TargetServer
- Error types extending base Error class (no custom base)
- Message correlation using uuid for request tracking
- **SSE reconnection in MVP** (not postponed) - exponential backoff with max attempts

**File Structure (with central types/ folder)**:
```
packages/mcp/src/
├── types/                       # SHARED types across domains
│   ├── auth.types.ts           # AuthConfig discriminated unions
│   ├── transport.types.ts      # TransportConfig types
│   ├── server.types.ts         # ExtendedTargetServer
│   └── index.ts                # Re-export all shared types
├── auth/
│   ├── interfaces/
│   │   ├── auth-provider.interface.ts  # IAuthProvider interface
│   │   └── token-storage.interface.ts  # ITokenStorage interface
│   ├── implementations/         # Concrete implementations
│   ├── errors/
│   │   └── authentication-error.ts
│   └── index.ts                # Re-exports auth domain
├── transports/
│   ├── implementations/         # SSEClientTransport, StdioClientTransport
│   ├── errors/
│   │   └── transport-error.ts
│   └── index.ts                # Re-exports transport domain
```

**CRITICAL**: Shared types (AuthConfig, TransportConfig, ExtendedTargetServer) go in `types/`. Domain-specific interfaces (IAuthProvider, ITokenStorage) stay in their domains.

**DO NOT** proceed to next phase until:
- [ ] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

### Phase 2: Configuration Schema Updates

**BEFORE** starting this phase:
- You **MUST** tick the checklist boxes for previous phase
- You **MUST** make sure that all files modified by the workers and this file have been commited

Jobs:
- **EXTEND (don't replace)** existing schemas in packages/mcp/src/config.ts:
  ```typescript
  // Extend existing TargetServerSchema, don't create new ServerConfig
  export const ExtendedTargetServerSchema = TargetServerSchema.extend({
    transport: TransportConfigSchema.optional(),
    auth: AuthConfigSchema.optional()
  }).refine(
    (data) => data.command || data.transport,
    { message: "Server must have either 'command' or 'transport'" }
  );
  ```
- Add AuthConfigSchema as Zod discriminated union
- Add TransportConfigSchema as Zod discriminated union
- Use existing env variable resolution from resolveEnvVars utility
- Ensure backwards compatibility - command field triggers stdio transport

**DO NOT** proceed to next phase until:
- [ ] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

### Phase 3: Tests with test.skip

**BEFORE** starting this phase:
- You **MUST** tick the checklist boxes for previous phase
- You **MUST** make sure that all files modified by the workers and this file have been commited

Jobs:
- Write comprehensive tests that define expected behavior
- Tests for OAuth2ClientCredentialsProvider (token acquisition, proactive refresh, expiry)
- Tests for SSEClientTransport (SSE connection, HTTP POST, message correlation, reconnection)
- Tests for TransportFactory (creating correct transport based on config)
- Tests for MemoryTokenStorage (store, retrieve, expiry checks, proactive refresh callbacks)
- Tests for environment variable resolution
- Tests for audience validation
- Tests for message correlation (request ID matching)
- All tests initially skipped but validate against types

**DO NOT** proceed to next phase until:
- [ ] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

### Phase 4: Auth Provider Implementations

**BEFORE** starting this phase:
- You **MUST** tick the checklist boxes for previous phase
- You **MUST** make sure that all files modified by the workers and this file have been commited

Jobs:
- No-auth and simple implementations:
    - NoAuthProvider (returns empty headers)
    - BearerTokenAuthProvider (static token)
    - MemoryTokenStorage (MVP token storage)
- OAuth2 implementation:
    - OAuth2ClientCredentialsProvider implementing IAuthProvider
    - Token expiry checking with 5-minute buffer time
    - Automatic refresh scheduling on token storage
    - Audience validation
    - Use existing logger: logEvent('auth:token_refresh', {...})
    - Error handling with AuthenticationError extending Error
- Security utilities:
    - Environment variable resolver
    - Token sanitization for logging

**DO NOT** proceed to next phase until:
- [ ] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

### Phase 5: Transport Implementations

**BEFORE** starting this phase:
- You **MUST** tick the checklist boxes for previous phase
- You **MUST** make sure that all files modified by the workers and this file have been commited

Jobs:
- Transport Factory:
    - Creates appropriate transport based on config
    - Handles legacy stdio detection (command field)
    - Injects auth providers and token storage
    - Environment variable resolution
- SSE Transport:
    - SSEClientTransport implementing MCP SDK Transport interface (NOT custom interface)
    - EventSource (eventsource npm package) for server→client messages
    - HTTP POST for client→server messages
    - Message correlation with uuid pending request Map
    - Auth header injection (query param for browser EventSource limitation)
    - **Automatic reconnection with exponential backoff (MVP, not postponed)**:
      - Max 5 attempts by default
      - Exponential delay: 1s, 2s, 4s, 8s, 16s
      - Proper cleanup on max attempts
    - 401 response handling with token refresh retry
    - AbortController timeout support
    - finishAuth method for future OAuth authorization code flow
    - Use existing logger: logEvent('transport:sse:connected', {...})
- Create new stdio transport abstraction:
    - **DO NOT MODIFY** PrefixedStdioClientTransport - it stays in src/index.ts unchanged
    - Create NEW StdioClientTransport in transports/implementations/
    - Extract reusable stdio logic (spawn, pipe handling) into new class
    - New StdioClientTransport implements MCP SDK's Transport interface
    - Transport factory uses StdioClientTransport for new configs

**File Structure**:
```
packages/mcp/src/
├── auth/
│   ├── implementations/
│   │   ├── no-auth-provider.ts
│   │   ├── bearer-token-provider.ts
│   │   ├── oauth2-client-credentials.ts
│   │   └── memory-token-storage.ts
├── transports/
│   ├── implementations/
│   │   ├── stdio-client-transport.ts
│   │   └── sse-client-transport.ts
│   ├── transport-factory.ts
```

**DO NOT** proceed to next phase until:
- [ ] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

### Phase 6: Integration with MCPProxy

**BEFORE** starting this phase:
- You **MUST** tick the checklist boxes for previous phase
- You **MUST** make sure that all files modified by the workers and this file have been commited

Jobs:
- Update MCPProxy class in packages/mcp/src/index.ts:
    - Add TransportFactory as class member
    - Initialize with MemoryTokenStorage
    - Update connectToTargetServers to use factory
    - Keep backwards compatibility for existing code paths
- Enhanced error handling:
    - Specific handling for AuthenticationError
    - Structured logging for auth failures
    - Security-aware error messages (no token exposure)

**DO NOT** proceed to next phase until:
- [ ] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

### Phase 7: Unskip & Run Tests

**BEFORE** starting this phase:
- You **MUST** tick the checklist boxes for previous phase
- You **MUST** make sure that all files modified by the workers and this file have been commited

Jobs:
- Enable tests progressively
- Validate OAuth2 flow with mock fetch and EventSource
- Test proactive token refresh scenarios
- Test SSE reconnection logic
- Test message correlation for async responses
- Verify audience validation
- Test retry logic and error handling
- Ensure backwards compatibility with stdio configs
- Integration test with full SSE + HTTP flow

**DO NOT** proceed to next phase until:
- [ ] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

## Key Implementation Details:

### Security Requirements
- **Token isolation**: Each upstream server has separate auth context
- **No token passthrough**: Never forward client tokens to upstream
- **Audience validation**: Verify token is for correct resource
- **Secure storage**: Credentials in env vars only (MVP)
- **Error sanitization**: Never expose tokens in logs or errors

### Extension Points
- ITokenStorage: Swap MemoryTokenStorage for KeychainStorage (Phase 2)
- IAuthProvider: Add OAuth2AuthCodeProvider for user delegation with finishAuth (Phase 2)
- Transport: Add WebSocketTransport implementing SDK interface (Phase 2)
- All Phase 2 features plug in without refactoring

### Backwards Compatibility
- Existing stdio configs continue working unchanged
- PrefixedStdioClientTransport remains for legacy code
- Command field triggers stdio transport automatically
- Transport field enables new transport types

### MVP Limitations (Acceptable)
- Tokens stored in memory only (lost on restart)
- No OAuth2 authorization code flow (only client credentials)
- No WebSocket transport (only SSE)
- No keychain integration (only memory storage)

## Critical Success Criteria:

1. **Zero Breaking Changes**: All existing configs and code must work unchanged
2. **MCP Spec Compliance**: OAuth2 implementation follows spec exactly
3. **Security First**: No token leakage, proper isolation, audience validation
4. **Type Safety**: Full TypeScript coverage with Zod validation
5. **Test Coverage**: Comprehensive tests for all auth scenarios
6. **Clean Abstractions**: Clear interfaces with single responsibilities

## Questions to Clarify Before Implementation:

1. ~Should we use SSE like MCP SDK's existing HTTP transport, or pure request-response?~ **RESOLVED: Use SSE pattern**
2. Should we support custom OAuth2 grant types beyond client credentials in MVP?
3. Are there specific OAuth2 providers we need to test against (Auth0, Okta, etc.)?
3. ~Should token refresh be automatic or require explicit trigger?~ **RESOLVED: Proactive refresh 5 minutes before expiry**
5. Do we need rate limiting for OAuth token requests?
6. Should we implement token caching across restarts (file-based) in MVP?
7. Are there specific error codes we should use for auth failures?
8. Should we support multiple auth methods per server (fallback)?
9. Do we need audit logging for authentication events?
10. How should we handle SSE reconnection limits and backoff strategies?

## Risk Assessment:

- **Risk**: Breaking existing stdio functionality
  - **Mitigation**: Keep PrefixedStdioClientTransport unchanged, create new abstractions

- **Risk**: Token leakage in logs
  - **Mitigation**: Sanitize all error messages, never log auth headers

- **Risk**: Confused deputy attacks
  - **Mitigation**: Strict token isolation, audience validation

- **Risk**: Complex migration for users
  - **Mitigation**: Full backwards compatibility, clear migration guide

## Dependencies:

- No new external dependencies (uses native fetch API)
- Existing: @modelcontextprotocol/sdk, zod
- Development: vitest for testing

Remember: **ALWAYS** validate and test at each phase gate before proceeding!