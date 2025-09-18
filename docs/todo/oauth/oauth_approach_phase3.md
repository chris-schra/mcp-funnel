# OAuth & SSE Transport Implementation - Phase 3: Test Completion & Verification

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

## Critical Gap Identified

The OAuth implementation has a significant testing gap that prevents us from claiming feature completion:
- **SSE Transport has 40 placeholder tests** - all contain only `expect(true).toBe(true)`
- **No end-to-end OAuth flow verification** - authentication with real servers untested
- **Primary transport untested** - SSE is the main OAuth transport but completely unverified

As the reviewer correctly noted: *"It's like building an engine and the chassis of a car but never testing if the engine can actually make the wheels turn."*

## Phase 3 Objectives

### Primary Goal
**Replace all SSE transport placeholder tests with functional tests that verify OAuth integration works in practice.**

### Success Criteria
- [ ] All 40 SSE transport placeholder tests replaced with real tests
- [ ] SSE transport test coverage matches WebSocket transport (≥90%)
- [ ] End-to-end OAuth flow tested with mock servers
- [ ] Integration tests verify token refresh, retries, and error handling
- [ ] Documentation updated to reflect actual completion status
- [ ] No skipped tests remaining in OAuth implementation

## Implementation Plan

### Task 1: SSE Transport Core Tests
**Priority: CRITICAL**
**Size: Large (8-12 hours)**

Replace placeholder tests with real implementations for:
- [ ] Connection establishment with EventSource
- [ ] OAuth token in query parameter (browser limitation workaround)
- [ ] Message event handling and parsing
- [ ] Error event handling and recovery
- [ ] Connection state management
- [ ] Proper cleanup on disconnect

**Files to modify:**
- `packages/mcp/test/unit/sse-client-transport.test.ts`

**Reference implementation:**
- Use `packages/mcp/test/unit/websocket-client-transport.test.ts` as template
- Adapt WebSocket patterns to SSE/EventSource specifics

### Task 2: SSE OAuth Integration Tests
**Priority: CRITICAL**
**Size: Medium (4-6 hours)**

Test OAuth-specific functionality:
- [ ] Auth header injection in HTTP POST requests
- [ ] Auth token as query parameter in EventSource URL
- [ ] 401 response handling with token refresh
- [ ] Retry logic with refreshed tokens
- [ ] Token expiry during active connection
- [ ] Multiple auth provider types (bearer, oauth2-client)

**New test file needed:**
- `packages/mcp/test/integration/sse-oauth-flow.test.ts`

### Task 3: SSE Message Correlation Tests
**Priority: HIGH**
**Size: Medium (3-4 hours)**

Test request/response correlation:
- [ ] UUID generation for request tracking
- [ ] Response matching via correlation IDs
- [ ] Pending request timeout handling
- [ ] Concurrent request management
- [ ] Out-of-order response handling
- [ ] Orphaned response handling

### Task 4: SSE Reconnection Tests
**Priority: HIGH**
**Size: Medium (3-4 hours)**

Test reconnection with exponential backoff:
- [ ] Automatic reconnection on connection loss
- [ ] Exponential backoff timing (1s, 2s, 4s, 8s, 16s)
- [ ] Max retry limit enforcement
- [ ] Connection state during reconnection
- [ ] Pending requests during reconnection
- [ ] Clean reconnection with fresh auth

### Task 5: End-to-End Integration Tests
**Priority: CRITICAL**
**Size: Large (6-8 hours)**

Create comprehensive integration tests:
- [ ] Full OAuth2 client credentials flow with mock OAuth server
- [ ] Token acquisition → SSE connection → authenticated requests
- [ ] Token refresh flow during long-running connections
- [ ] Server-initiated disconnects with re-authentication
- [ ] Multiple concurrent SSE connections with different auth
- [ ] Error scenarios (invalid tokens, expired tokens, revoked tokens)

**New test file needed:**
- `packages/mcp/test/e2e/oauth-sse-integration.test.ts`

### Task 6: Mock Server Infrastructure
**Priority: HIGH**
**Size: Medium (4-5 hours)**

Build test infrastructure:
- [ ] Mock OAuth2 authorization server
- [ ] Mock SSE server with auth validation
- [ ] Controllable token expiry for testing
- [ ] Event injection for SSE testing
- [ ] Network failure simulation
- [ ] Response delay simulation

**New utilities needed:**
- `packages/mcp/test/mocks/oauth-server.ts`
- `packages/mcp/test/mocks/sse-server.ts`

### Task 7: Performance & Load Tests
**Priority: MEDIUM**
**Size: Small (2-3 hours)**

Verify performance characteristics:
- [ ] Connection establishment time with OAuth
- [ ] Message throughput with auth overhead
- [ ] Token refresh impact on latency
- [ ] Memory usage with multiple connections
- [ ] Connection pool limits
- [ ] Graceful degradation under load

### Task 8: Security Tests
**Priority: HIGH**
**Size: Small (2-3 hours)**

Verify security properties:
- [ ] No token leakage in logs
- [ ] No token exposure in error messages
- [ ] Query parameter sanitization in URLs
- [ ] Secure token storage in memory
- [ ] Token cleanup on disconnect
- [ ] No token replay vulnerabilities

### Task 9: Documentation Update
**Priority: HIGH**
**Size: Small (1-2 hours)**

Update all documentation:
- [ ] Mark SSE transport as fully tested
- [ ] Update test coverage metrics
- [ ] Document OAuth flow end-to-end
- [ ] Add troubleshooting guide
- [ ] Update implementation status
- [ ] Remove "partial completion" notes

## Execution Strategy

### Parallel Work Opportunities
Tasks that can be done in parallel by different workers:
- **Group A**: Task 1 (SSE Core Tests) + Task 6 (Mock Infrastructure)
- **Group B**: Task 3 (Message Correlation) + Task 4 (Reconnection)
- **Group C**: Task 7 (Performance) + Task 8 (Security)

### Sequential Dependencies
1. Task 6 (Mock Infrastructure) → Task 5 (E2E Tests)
2. Task 1 (Core Tests) → Task 2 (OAuth Integration)
3. All testing tasks → Task 9 (Documentation)

## Validation Checklist

Before marking Phase 3 complete:
- [ ] `yarn test packages/mcp` - ALL tests pass (no skips)
- [ ] Test coverage report shows ≥90% for SSE transport
- [ ] Manual testing with real OAuth provider succeeds
- [ ] Performance benchmarks meet requirements
- [ ] Security audit passes
- [ ] Documentation review complete
- [ ] Code review by team lead

## Risk Mitigation

### Identified Risks
1. **EventSource API limitations** - May need polyfill for full testing
2. **OAuth server mocking complexity** - Consider using existing OAuth mock libraries
3. **Timing-dependent tests** - Use controllable timers and avoid real delays
4. **Browser vs Node.js differences** - Ensure tests work in both environments

### Mitigation Strategies
- Use proven libraries (eventsource polyfill, nock for HTTP mocking)
- Implement deterministic time control for tests
- Run tests in both Node.js and browser environments
- Add retry logic to flaky tests with clear failure messages

## Success Metrics

### Quantitative
- **Test Count**: 40+ real SSE tests (currently 0)
- **Coverage**: ≥90% line coverage for SSE transport
- **Performance**: Connection setup <100ms, message latency <10ms
- **Reliability**: 0 flaky tests in CI/CD

### Qualitative
- Reviewer approval: "The engine makes the wheels turn"
- Team confidence in OAuth implementation
- No critical bugs in first production deployment
- Clear documentation for troubleshooting

## Timeline Estimate

**Total Effort**: 35-50 hours
**Recommended Team Size**: 2-3 developers
**Calendar Time**: 1-2 weeks (with parallel execution)

### Week 1
- Day 1-2: Mock infrastructure + SSE core tests
- Day 3-4: OAuth integration + Message correlation
- Day 5: Reconnection tests + Initial E2E tests

### Week 2
- Day 1-2: Complete E2E tests
- Day 3: Performance + Security tests
- Day 4: Documentation + Code review
- Day 5: Buffer for fixes and final validation

## Definition of Done

Phase 3 is complete when:
1. ✅ All 40 SSE placeholder tests replaced with functional tests
2. ✅ End-to-end OAuth flow verified with integration tests
3. ✅ No skipped tests in OAuth implementation
4. ✅ Test coverage ≥90% for all transport implementations
5. ✅ Documentation accurately reflects implementation status
6. ✅ All validation checklist items passed
7. ✅ Reviewer confirms: "The promise has been fulfilled"

---

**Note**: This phase is CRITICAL for production readiness. The OAuth feature cannot be considered complete until these tests are implemented and passing.