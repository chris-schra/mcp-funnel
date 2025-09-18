# OAuth & SSE Transport Implementation - Phase 3: DRY Refactoring & Test Completion

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

## Critical Gaps Identified

### Test Redundancy (60-70% duplication)
- Both SSE and WebSocket tests duplicate base class functionality testing
- 78 SSE placeholder tests would create massive redundancy if implemented as-is
- Base transport functionality tested multiple times instead of once

### Code DRY Violations
1. **Environment Variable Resolution**
   - Duplicated in `oauth2-client-credentials.ts` and `oauth2-authorization-code.ts`
   - `resolveEnvironmentVariables()` function repeated (~40 lines each)

2. **OAuth2 Types and Constants**
   - `OAuth2TokenResponse` and `OAuth2ErrorResponse` interfaces duplicated
   - Constants duplicated: `DEFAULT_EXPIRY_SECONDS`, `MAX_RETRIES`, `RETRY_DELAY_MS`

3. **HTTP Request Logic**
   - `SSEClientTransport::sendHttpRequest()` contains 100+ lines (lines 219-315)
   - Auth headers, 401 handling, retry logic should be in base class
   - WebSocket could reuse this for HTTP-based operations

4. **OAuth Provider Methods**
   - Identical implementations across OAuth providers:
     - `getHeaders()`, `isValid()`, `refresh()`, `ensureValidToken()`
   - Error handling and retry patterns duplicated

## Existing Infrastructure Analysis

### Available Testing Infrastructure
**Testing Framework:**
- **Vitest v3.2.4** with built-in mocking (`vi.fn()`, `vi.mock()`)
- **Coverage**: @vitest/coverage-v8 for code coverage
- **Node environment** with 10-second test timeouts

**Key Dependencies Already Available:**
- **eventsource v4.0.0** - EventSource implementation (already in use)
- **express v5.1.0** - For building mock SSE servers
- **UUID v13.0.0** - Request correlation IDs
- **ws v8.18.3** - WebSocket reference implementation

**Existing Mock Patterns:**
- **OAuth Provider Tests**: Complete fetch mocking, token storage patterns
- **WebSocket Transport**: 320+ line MockWebSocket class as template
- **Mock MCP Servers**: Stdio-based servers in test/fixtures/

### What We Have vs What We Need

✅ **Ready to Use:**
- Vitest mocking infrastructure
- Express for mock SSE servers
- EventSource package already installed
- OAuth mocking patterns from provider tests
- WebSocket test patterns as template

⚠️ **Needs Implementation:**
- Mock SSE server using Express
- Enhanced EventSource mock
- Integration test harness for SSE+OAuth flow

❌ **NOT Needed:**
- No new npm packages required
- No new testing frameworks needed
- No additional mocking libraries required

## Phase 3 Objectives

### Primary Goal
**Eliminate DRY violations in both implementation and tests while completing SSE transport testing.**

### Success Criteria
- [ ] All code DRY violations eliminated (extracted to shared utilities)
- [ ] Base transport tests created for shared functionality
- [ ] SSE-specific tests implemented (15-20 tests only)
- [ ] WebSocket tests refactored to remove base functionality tests
- [ ] End-to-end OAuth flow tested with mock servers
- [ ] Zero test redundancy between transports
- [ ] 90%+ coverage maintained with 50% fewer tests

## Implementation Plan

### Task 1: Extract Shared OAuth Utilities
**Priority: CRITICAL**
**Size: Medium (4-5 hours)**

**BEFORE** starting this task:
- You **MUST** tick the checklist boxes for previous phase
- You **MUST** make sure that all files modified by the workers and this file have been committed
- You **MUST** assess current OAuth provider implementations
- You **MUST** identify all duplicated code patterns
- You **MUST** ensure no other worker is modifying OAuth providers

**Files to create:**
- `packages/mcp/src/auth/utils/oauth-utils.ts`
- `packages/mcp/src/auth/utils/oauth-types.ts`

**Extract from OAuth providers:**
- [ ] Move OAuth2TokenResponse and OAuth2ErrorResponse to oauth-types.ts
- [ ] Extract resolveEnvironmentVariables() to oauth-utils.ts
- [ ] Move shared constants (DEFAULT_EXPIRY_SECONDS, MAX_RETRIES, RETRY_DELAY_MS)
- [ ] Create shared error handling patterns
- [ ] Update both OAuth providers to import from utils
- [ ] Use new standardized OAuth field names (no backward compatibility needed)

**Files to modify:**
- `packages/mcp/src/auth/implementations/oauth2-client-credentials.ts`
- `packages/mcp/src/auth/implementations/oauth2-authorization-code.ts`

**DO NOT** proceed to next task until:
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] You did a thorough review of all code changes using code-reasoning tool
- [ ] All files modified by this task have been committed

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next task.

### Task 2: Create Base OAuth Provider
**Priority: HIGH**
**Size: Medium (4-5 hours)**

**BEFORE** starting this task:
- You **MUST** tick the checklist boxes for previous task
- You **MUST** make sure that all files modified by the workers and this file have been committed
- You **MUST** ensure Task 1 is complete (utilities extracted)
- You **MUST** verify OAuth utilities are properly exported
- You **MUST** ensure no other worker is modifying OAuth providers

**Files to create:**
- `packages/mcp/src/auth/implementations/base-oauth-provider.ts`

**Extract shared methods:**
- [ ] getHeaders() implementation (fully shared)
- [ ] isValid() implementation (fully shared)
- [ ] refresh() base implementation (partially shared, calls abstract acquireToken())
- [ ] ensureValidToken() implementation (fully shared)
- [ ] parseTokenResponse() utility (fully shared)
- [ ] parseErrorResponse() utility (fully shared)
- [ ] createOAuth2Error() utility (fully shared)
- [ ] scheduleProactiveRefresh() implementation (fully shared)
- [ ] Token storage integration
- [ ] Error handling and retry logic
- [ ] Abstract acquireToken() method for subclasses

**Update providers to extend base:**
- [ ] OAuth2ClientCredentialsProvider extends BaseOAuthProvider
- [ ] OAuth2AuthCodeProvider extends BaseOAuthProvider
- [ ] Remove duplicated methods and use base class implementations

**DO NOT** proceed to next task until:
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] You did a thorough review of all code changes using code-reasoning tool
- [ ] All files modified by this task have been committed

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next task.

### Task 3: Extract HTTP Utilities to Base Transport (Streaming-Capable Design)
**Priority: CRITICAL**
**Size: Large (6-8 hours)**

**BEFORE** starting this task:
- You **MUST** tick the checklist boxes for previous task
- You **MUST** make sure that all files modified by the workers and this file have been committed
- You **MUST** assess current transport implementations
- You **MUST** identify HTTP logic that can be shared
- You **MUST** ensure no other worker is modifying transports

**Files to modify:**
- `packages/mcp/src/transports/implementations/base-client-transport.ts`
- `packages/mcp/src/transports/implementations/sse-client-transport.ts`

**Create streaming-capable HTTP utility in base class:**
- [ ] Create executeHttpRequest() method with streaming support options
- [ ] Add HttpRequestOptions interface with streaming?: boolean flag
- [ ] Return type should support both Response and ReadableStream access
- [ ] Add async generator helper for reading stream chunks
- [ ] Implement automatic auth header injection
- [ ] Implement 401 response handling with token refresh
- [ ] Create sendJsonRequest() convenience method for non-streaming
- [ ] Move retry logic implementation to base
- [ ] Move request timeout handling to base
- [ ] Move error mapping utilities to base

**Design for future Streamable HTTP support:**
- [ ] Response wrapper should expose bodyStream when available
- [ ] Include readChunks() async generator for streaming responses
- [ ] Support both text and binary stream decoding
- [ ] Design pattern that works for SSE, Streamable HTTP, and future transports

**SSE transport updates:**
- [ ] Remove sendHttpRequest() implementation
- [ ] Use base class executeHttpRequest() or sendJsonRequest()
- [ ] Keep only SSE-specific logic (EventSource, query params)
- [ ] Adapt to use the new flexible HTTP pattern

**DO NOT** proceed to next task until:
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] You did a thorough review of all code changes using code-reasoning tool
- [ ] All files modified by this task have been committed

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next task.

### Task 4: Create Base Transport Test Suite
**Priority: CRITICAL**
**Size: Medium (5-6 hours)**

**BEFORE** starting this task:
- You **MUST** tick the checklist boxes for previous task
- You **MUST** make sure that all files modified by the workers and this file have been committed
- You **MUST** ensure Task 3 is complete (HTTP utilities extracted)
- You **MUST** verify base transport has shared methods
- You **MUST** review existing test patterns from WebSocket tests

**Files to create:**
- `packages/mcp/test/unit/base-client-transport.test.ts`
- `packages/mcp/test/unit/transport-utils.test.ts`

**Test categories for base transport:**
- [ ] Configuration management and validation
- [ ] Authentication provider integration
- [ ] Message correlation (pending requests)
- [ ] Reconnection manager integration
- [ ] Data sanitization utilities
- [ ] Lifecycle management (start/close)
- [ ] HTTP request handling (new shared method)

**Test categories for transport utils:**
- [ ] ReconnectionManager behavior
- [ ] Exponential backoff calculations
- [ ] Utility function testing

**DO NOT** proceed to next task until:
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] You did a thorough review of all code changes using code-reasoning tool
- [ ] All files modified by this task have been committed

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next task.

### Task 5: Refactor WebSocket Transport Tests
**Priority: HIGH**
**Size: Medium (3-4 hours)**

**BEFORE** starting this task:
- You **MUST** tick the checklist boxes for previous task
- You **MUST** make sure that all files modified by the workers and this file have been committed
- You **MUST** ensure Task 4 is complete (base tests exist)
- You **MUST** verify base transport tests cover shared functionality
- You **MUST** ensure no other worker is modifying WebSocket tests

**Files to modify:**
- `packages/mcp/test/unit/websocket-client-transport.test.ts`

**Remove tests for base functionality:**
- [ ] Configuration validation tests
- [ ] Basic auth integration tests
- [ ] Message correlation tests
- [ ] Reconnection logic tests
- [ ] Data sanitization tests

**Keep only WebSocket-specific tests:**
- [ ] WebSocket connection establishment
- [ ] Bidirectional messaging
- [ ] Ping/pong heartbeat
- [ ] WebSocket close codes
- [ ] Auth headers in handshake

**DO NOT** proceed to next task until:
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] You did a thorough review of all code changes using code-reasoning tool
- [ ] All files modified by this task have been committed

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next task.

### Task 6: Implement SSE-Specific Tests Only
**Priority: CRITICAL**
**Size: Medium (5-6 hours)**

**BEFORE** starting this task:
- You **MUST** tick the checklist boxes for previous task
- You **MUST** make sure that all files modified by the workers and this file have been committed
- You **MUST** ensure Task 4 is complete (base tests exist)
- You **MUST** ensure Task 7 is complete (mock infrastructure)
- You **MUST** verify SSE transport implementation is stable

**Files to modify:**
- `packages/mcp/test/unit/sse-client-transport.test.ts`

**Replace placeholders with actual SSE-specific test implementations:**
- [ ] EventSource connection establishment (implement actual test)
- [ ] SSE message event handling (implement actual test)
- [ ] HTTP POST for client→server messages (implement actual test)
- [ ] Auth token as query parameter for browser limitation (implement actual test)
- [ ] EventSource error states and recovery (implement actual test)
- [ ] SSE-specific reconnection behavior (implement actual test)
- [ ] EventSource cleanup (implement actual test)
- [ ] Remove all placeholder tests with expect(true).toBe(true)
- [ ] Implement real assertions and mock interactions

**Expected test count: ~15-20 implemented tests (not 40 placeholders)**

**DO NOT** proceed to next task until:
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] You did a thorough review of all code changes using code-reasoning tool
- [ ] All files modified by this task have been committed

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next task.

### Task 7: Create SSE Mock Infrastructure
**Priority: HIGH**
**Size: Medium (4-5 hours)**

**BEFORE** starting this task:
- You **MUST** tick the checklist boxes for previous task
- You **MUST** make sure that all files modified by the workers and this file have been committed
- You **MUST** review MockWebSocket implementation for patterns
- You **MUST** verify Express is available as dependency
- You **MUST** ensure test/mocks directory exists

**Files to create:**
- `packages/mcp/test/mocks/mock-eventsource.ts`
- `packages/mcp/test/mocks/mock-sse-server.ts`

**MockEventSource (similar to MockWebSocket):**
- [ ] Controllable readyState
- [ ] Event emission simulation
- [ ] Error injection
- [ ] Connection lifecycle

**MockSSEServer (using Express):**
- [ ] SSE endpoint with event streaming
- [ ] POST endpoint for messages
- [ ] Auth validation
- [ ] Error simulation

**DO NOT** proceed to next task until:
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] You did a thorough review of all code changes using code-reasoning tool
- [ ] All files modified by this task have been committed

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next task.

### Task 8: End-to-End OAuth Flow Tests
**Priority: HIGH**
**Size: Medium (4-5 hours)**

**BEFORE** starting this task:
- You **MUST** tick the checklist boxes for previous task
- You **MUST** make sure that all files modified by the workers and this file have been committed
- You **MUST** ensure ALL previous tasks are complete
- You **MUST** verify mock infrastructure is working
- You **MUST** ensure OAuth providers and transports are stable

**Files to create:**
- `packages/mcp/test/e2e/oauth-sse-integration.test.ts`

**Integration scenarios:**
- [ ] Complete OAuth2 flow with mock server
- [ ] Token refresh during active connection
- [ ] 401 handling and retry
- [ ] Connection recovery with auth
- [ ] Multiple concurrent authenticated connections

**DO NOT** proceed to next task until:
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] You did a thorough review of all code changes using code-reasoning tool
- [ ] All files modified by this task have been committed

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next task.

### Task 9: Create OAuth Utility Tests
**Priority: MEDIUM**
**Size: Small (2-3 hours)**

**BEFORE** starting this task:
- You **MUST** tick the checklist boxes for previous task
- You **MUST** make sure that all files modified by the workers and this file have been committed
- You **MUST** ensure Task 1 and 2 are complete (utilities and base provider)
- You **MUST** verify utilities are properly exported
- You **MUST** review existing OAuth provider tests for patterns

**Files to create:**
- `packages/mcp/test/unit/oauth-utils.test.ts`
- `packages/mcp/test/unit/base-oauth-provider.test.ts`

**Test coverage for extracted utilities:**
- [ ] Environment variable resolution
- [ ] Token response parsing
- [ ] Error response handling
- [ ] Shared constants validation
- [ ] Base provider methods

**DO NOT** mark this task as complete until:
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] You did a thorough review of all code changes using code-reasoning tool
- [ ] All files modified by this task have been committed

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** marking as complete.

## Execution Strategy

### Parallel Work Groups

**Group A: OAuth Refactoring (Tasks 1, 2, 9)**
- Extract shared OAuth utilities
- Create base OAuth provider
- Test OAuth utilities
- Can work independently

**Group B: Transport Refactoring (Task 3)**
- Extract HTTP utilities to base transport
- Critical path item
- Blocks Task 4

**Group C: Mock Infrastructure (Task 7)**
- Create EventSource and SSE server mocks
- Can work independently
- Needed for Task 6

### Sequential Dependencies
1. Task 3 (HTTP extraction) → Task 4 (Base transport tests)
2. Task 4 (Base tests) → Task 5 (WebSocket refactor) & Task 6 (SSE tests)
3. Task 7 (Mocks) → Task 6 (SSE tests)
4. All tasks → Task 8 (E2E tests)

## Validation Checklist

Before marking Phase 3 complete:
- [ ] `yarn test packages/mcp` - ALL tests pass
- [ ] Zero code duplication (validated by lint tools)
- [ ] Test count reduced by ~50% with same coverage
- [ ] No placeholder tests remaining
- [ ] Coverage report shows ≥90% for all transports
- [ ] E2E OAuth flow validates with real requests
- [ ] Code review confirms DRY principles followed

## Risk Mitigation

### Identified Risks
1. **Base class changes affect both transports** - Comprehensive testing required
2. **OAuth provider refactoring** - Must maintain backward compatibility
3. **Test reduction** - Must maintain coverage while reducing count

### Mitigation Strategies
- Run full test suite after each refactoring step
- Keep old code commented during transition
- Use coverage reports to ensure no regression
- Review each extraction with code-reasoning tool

## Success Metrics

### Quantitative
- **Code Duplication**: 0% (down from current ~40%)
- **Test Count**: ~65 total (down from 120+)
- **Test Coverage**: ≥90% maintained
- **DRY Violations**: 0 remaining

## Implementation Decisions

### OAuth Refactoring
- Use new standardized OAuth field names (no backward compatibility required)
- Create base class with both fully and partially shared implementations
- Abstract acquireToken() method for subclass-specific logic

### Transport HTTP Utilities
- Implement streaming-capable executeHttpRequest() with options pattern
- Response type supports both regular and streaming responses
- Provide async generators for reading stream chunks
- Provide convenience methods like sendJsonRequest() for non-streaming
- Allow transports to customize HTTP behavior while sharing auth/retry logic
- Design with SEAMS for future Streamable HTTP support (SSE is deprecated in MCP specs)
- HTTP utilities ready for SSE, Streamable HTTP, and future streaming transports

### Test Implementation
- Replace all SSE placeholder tests with actual implementations
- Focus on SSE-specific behavior only (~15-20 tests)
- Base transport tests will cover shared functionality

### Breaking Changes
- Internal AND public API modifications allowed to improve architecture
- Tests can be changed as needed to match new implementations
- No backward compatibility required for existing implementations

## Definition of Done

Phase 3 is complete when:
- [ ] Zero code duplication across OAuth providers
- [ ] Zero code duplication across transports
- [ ] Base transport tests eliminate test redundancy
- [ ] SSE has ~20 specific tests, not 78 redundant ones
- [ ] All tests passing with ≥90% coverage
- [ ] E2E OAuth flow verified
- [ ] Code review confirms DRY principles followed