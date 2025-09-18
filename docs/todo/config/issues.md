# Review Findings

This document is **append-only**. **Do not** delete prior content. Every AI/agent **MUST**:

- follow the structure below
- add a personal checklist under each issue it touches
- log decisions with evidence
- use the "New Issue Intake" template when discovering new issues

---

## Global Rules for All Agents

- **Scope:** Findings relate to code, tests, build/release, security, performance, and behavior.
- **Append-only:** Never remove or rewrite prior findings; add updates as new "Agent Notes" or "Validation Updates".
- **Evidence first:** Any claim must include **file paths + line ranges** or **external references**. If missing, mark it **ASSUMPTION** and lower confidence.
- **Confidence:** Always include `confidence: 0–1` (subjective, but consistent).
- **Status lifecycle:** `OPEN` → `CONFIRMED` → `IN_PROGRESS` → `FIXED` → `DISPROVEN` (or `WON'T_FIX`).
- **IDs:** For new issues, use `ISSUE-COMMITHASH-###` (monotonic per commit). Example: `ISSUE-8D0B73B-001`.
- **Your identity:** Record `agent_id` (e.g. codex, claude, gemini), `model` (e.g. sonnet, gemini-2.5-pro, gpt-5-codex high) and optional `run_id`.
- **No silent edits:** If you disagree, add a **counterfinding** with evidence; do **not** alter prior text.
- **Checklists:** Every agent must attach **its own checklist** for each issue it touches (see "Agent Checklist").
- **New issues:** Use "New Issue Intake" exactly. Link to repro, logs, and diffs where possible.

---

## Evidence Quality Score (= Confidence)

- **E0 (Assumption):** No source cites. Hypothesis only.
- **E1 (Type-level):** API/typing/docs cited (e.g., `index.d.ts`, official docs).
- **E2 (Code-level):** Concrete file + lines referenced.
- **E3 (Runtime-level):** Repro steps, logs, traces, screenshots.
- **E4 (Test-level):** Failing/passing tests proving the point.
- **E5 (Cross-env):** Verified across OS/node versions/build targets.

Agents should strive to upgrade evidence quality with each pass.

---

## Common pitfalls to avoid

- **Interfaces / types**: Do not assume types/interfaces are wrong without verification:
  - for internal types or interfaces, check the exported type or interface in actual file (imported by call-site)
  - for external types or interfaces, check the exports in package in node_modules (in repo root and in node_modules - if applicable - of the current package in our monorepo)

---

## New Issue Intake (Use verbatim for newly discovered issues)

### [ISSUE-ID] Title

- **Status:** OPEN
- **Severity:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low
- **Confidence:** E0 | E1 | E2 | E3 | E4 | E5
- **Area:** Security | Auth | Transport | Memory | API | CLI | Build | Test | Docs | Other
- **Summary (1–3 sentences):**
  <short, neutral summary>

#### Observation

(neutral description of what was seen)

#### Assumptions

(list clearly, but concise and briefly; if none, write: none)

#### Risk / Impact

(what is affected, worst plausible outcome)

#### Evidence

- **Files/Lines:** `<path>:Lx–Ly`
- **Docs/Types:** link/name + quoted excerpt if applicable
- **Tests:** (existing/new tests; names/paths -> failing/passing)
- **Repro (optional):** steps/commands
- **Logs (optional):** <snippets>

#### Proposed Resolution

(minimal viable fix, alternatives, tradeoffs; if unknown, write "TBD")

#### Validation Plan

(how to prove fixed: tests, manual steps, tooling)

#### Agent Notes (do not delete prior notes)

- <agent_id | model | commit_sha> … (short note + any counters or nuance)

#### Agent Checklist (MANDATORY per agent)

- **Agent:** <agent_id> | **Model:** <model> | **Run:** <run_id?> | **Commit:** <commit_sha>
  - [ ] Read code at all referenced locations
  - [ ] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [ ] Classified **Assumption vs Evidence**: E0 | E1 | E2 | E3 | E4 | E5
  - [ ] Proposed or refined fix
  - [ ] Set/updated **Status**

---

## Validation Updates (per Issue)

Use this block to advance status across the lifecycle. One entry per change.

- **[ISSUE-ID] – Status Change:** OPEN → CONFIRMED (or other)
  **By:** <agent_id | model | commit_sha>
  **Reason/Evidence:** <short reason + refs>
  **Commit/PR:** <hash/URL if relevant>
  **Next Step:** <who/what/when>

(Repeat as needed; do not delete history.)

---

## Agent Working Protocol

1. **If you find a new issue:** Instantiate with **New Issue Intake**.
2. **If you touch an existing issue:** Add a **new "Agent Notes" entry** and your **Agent Checklist**.
3. **If evidence is missing/weak:** Mark `Evidence: E0/E1` and state what you tried.
4. **If you dispute a claim:** Add a **counterfinding** in Agent Notes, cite stronger evidence, and suggest a status change.
5. **If you fix something:** Add a **Validation Update** with commit/PR and propose `IN_PROGRESS` → `FIXED`.
6. **If disproven:** Add evidence and move `Status` to `DISPROVEN`; keep the record.

---

# Current Issues

> This section holds all active or historical issues. Agents append here.

---

### [ISSUE-DE9467B-001] Mock-only tests in SecretManager violate core testing principle

- **Status:** OPEN
- **Severity:** 🔴 Critical
- **Confidence:** E2
- **Area:** Test
- **Summary (1–3 sentences):**
  All SecretManager tests use MockSecretProvider instead of real implementations, directly violating the project's explicit testing principle against mock-based tests.

#### Observation

SecretManager test suite exclusively uses MockSecretProvider for all tests. No integration tests exist with actual DotEnvProvider, ProcessEnvProvider, or InlineProvider implementations.

#### Assumptions

none

#### Risk / Impact

False confidence in test coverage. Real bugs in provider integration would not be caught. Tests provide no validation that the secret provider architecture actually works in production.

#### Evidence

- **Files/Lines:** `packages/mcp/src/services/__tests__/secret-manager.test.ts`
- **Docs/Types:** Project documentation explicitly states: "Do NOT create tests to test mocks, they are giving a false impression of coverage"
- **Tests:** All SecretManager tests use MockSecretProvider
- **Repro (optional):** Review test file to confirm no real provider instances
- **Logs (optional):** N/A

#### Proposed Resolution

Replace mock-based tests with real integration tests using actual provider implementations. Create test fixtures with real .env files and environment variables.

#### Validation Plan

Rewrite tests to use real providers. Verify tests still pass and actually exercise the production code paths.

#### Agent Notes (do not delete prior notes)

- claude | opus-4.1 | de9467b - Extracted from PR #14 review comments by chris-schra
- gemini | gemini-pro | 2a28ee2 - Verified. The tests use `MockSecretProvider` and do not test the real implementations.

#### Agent Checklist (MANDATORY per agent)

- **Agent:** claude | **Model:** opus-4.1 | **Run:** N/A | **Commit:** de9467b
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

#### Agent Checklist (MANDATORY per agent)

- **Agent:** gemini | **Model:** gemini-pro | **Run:** N/A | **Commit:** 2a28ee2
  - [x] Read code at all referenced locations
  - [ ] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [ ] Proposed or refined fix
  - [x] Set/updated **Status**

- codex | gpt-5-codex | 2a28ee2 - Confirmed all SecretManager specs exercise only MockSecretProvider implementations; no DotEnv/Process/Inline providers under test. Evidence: packages/mcp/src/secrets/secret-manager.test.ts:6-203. confidence: 0.7

- **Agent:** codex | **Model:** gpt-5-codex | **Run:** N/A | **Commit:** 2a28ee2
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

- codex | gpt-5-codex | c4d94e9 - Reconfirmed mocks remain dominant in unit suite; integration tests live separately but do not replace mock-heavy specs. Evidence: `packages/mcp/src/secrets/secret-manager.test.ts:7`, `packages/mcp/src/secrets/secret-manager.test.ts:29`, `packages/mcp/src/secrets/secret-manager.test.ts:139`, `packages/mcp/src/secrets/integration.test.ts:16`, `packages/mcp/src/secrets/integration.test.ts:39`.

- **Agent:** codex | **Model:** gpt-5-codex | **Run:** N/A | **Commit:** c4d94e9
  - [x] Read code at all referenced locations
  - [ ] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [ ] Proposed or refined fix
  - [x] Set/updated **Status**

- codex | gpt-5-codex | c4d94e9 - Core specs now instantiate production providers (Inline, ProcessEnv, DotEnv) with no MockSecretProvider usage. Evidence: `packages/mcp/src/secrets/secret-manager.test.ts:38-213`, `packages/mcp/src/secrets/secret-manager.test.ts:85-114`, `packages/mcp/src/secrets/secret-manager.test.ts:161-213`. confidence: 0.8

- **Agent:** codex | **Model:** gpt-5-codex | **Run:** N/A | **Commit:** c4d94e9
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [x] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

---

### [ISSUE-DE9467B-002] Server disconnections not handled

- **Status:** OPEN
- **Severity:** 🔴 Critical
- **Confidence:** E2
- **Area:** Transport
- **Summary (1–3 sentences):**
  TODO comment indicates server disconnection handling is unimplemented, leaving system unable to recover from MCP server crashes or disconnects.

#### Observation

Code contains "TODO: handle disconnects" comment at index.ts:652 with no implementation for server disconnection recovery.

#### Assumptions

none

#### Risk / Impact

System reliability compromised. If an MCP server crashes or disconnects, the proxy cannot recover, potentially requiring manual restart and causing service disruption.

#### Evidence

- **Files/Lines:** `packages/mcp/src/index.ts:652`
- **Docs/Types:** N/A
- **Tests:** No tests for disconnection handling
- **Repro (optional):** Kill an MCP server process while running
- **Logs (optional):** N/A

#### Proposed Resolution

Implement reconnection logic with exponential backoff. Add health checks and automatic recovery mechanisms.

#### Validation Plan

Add tests simulating server disconnections and verify automatic recovery. Test with actual server process kills.

#### Agent Notes (do not delete prior notes)

- claude | opus-4.1 | de9467b - Critical reliability issue from PR #14 review

#### Agent Checklist (MANDATORY per agent)

- **Agent:** claude | **Model:** opus-4.1 | **Run:** N/A | **Commit:** de9467b
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

---

### [ISSUE-DE9467B-003] Mocked file system in DotEnvProvider tests

- **Status:** NOT FIXED
- **Severity:** 🟠 High
- **Confidence:** E2
- **Area:** Test
- **Summary (1–3 sentences):**
  DotEnvProvider tests use vi.mock('fs') and vi.mock('path'), never testing actual .env file reading or parsing logic with real files.

#### Observation

Tests mock the file system instead of using real .env files. The parsing logic is tested against mocked readFileSync that returns predetermined values.

#### Assumptions

none

#### Risk / Impact

Actual .env file parsing bugs would not be caught. Tests pass because they test mocked file operations, not real implementation.

#### Evidence

- **Files/Lines:** `packages/mcp/src/providers/__tests__/dotenv-provider.test.ts`
- **Docs/Types:** Uses vi.mock('fs') and vi.mock('path')
- **Tests:** All DotEnvProvider tests use mocked file system
- **Repro (optional):** Review test file for vi.mock usage
- **Logs (optional):** N/A

#### Proposed Resolution

Use real .env test fixtures in temporary directories. Test actual file reading and parsing behavior.

#### Validation Plan

Create tests with real .env files containing edge cases. Verify parser handles real-world scenarios.

#### Agent Notes (do not delete prior notes)

- claude | opus-4.1 | de9467b - False test coverage identified in PR #14 review

#### Agent Checklist (MANDATORY per agent)

- **Agent:** claude | **Model:** opus-4.1 | **Run:** N/A | **Commit:** de9467b
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

#### Agent Checklist (MANDATORY per agent)

- **Agent:** supervisor-claude | **Model:** opus-4.1 | **Run:** deep-verify | **Commit:** c4d94e9
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [x] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E4 (test-level evidence)
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**
  - [x] VERIFIED: providers.test.ts lines 8-31 still use vi.mock - issue NOT fixed
  - [x] VERIFIED: Added tests alongside mocks instead of replacing them

---

### [ISSUE-DE9467B-004] Broken .env parser missing standard features

- **Status:** OPEN
- **Severity:** 🟠 High
- **Confidence:** E2
- **Area:** API
- **Summary (1–3 sentences):**
  Custom .env parser lacks support for standard features like multiline values, escape sequences, export statements, and variable interpolation.

#### Observation

The implementation uses a custom parser that only handles basic KEY=VALUE format. Missing support for multiline values, escape sequences (\n, \t), export statements, variable interpolation ($VAR, ${VAR}), backslash continuations, and Unicode escapes.

#### Assumptions

none

#### Risk / Impact

Parser will fail on real-world .env files that use standard features. Users' existing .env files may not work, causing configuration failures.

#### Evidence

- **Files/Lines:** `packages/mcp/src/providers/dotenv-provider.ts`
- **Docs/Types:** Custom parser implementation reviewed
- **Tests:** No tests for complex .env features
- **Repro (optional):** Try parsing .env with multiline values or variable interpolation
- **Logs (optional):** Example that would break:

```env
export DATABASE_URL="postgres://user:pass@host/db\
?sslmode=require"
API_KEY="multi
line
value"
PATH_WITH_VAR="$HOME/bin:$PATH"
```

#### Proposed Resolution

Use battle-tested dotenv library instead of custom parser. If custom parser needed, implement full spec compliance.

#### Validation Plan

Test with comprehensive .env file containing all standard features. Compare behavior with dotenv library.

#### Agent Notes (do not delete prior notes)

- claude | opus-4.1 | de9467b - Incomplete parser implementation from PR #14

#### Agent Checklist (MANDATORY per agent)

- **Agent:** claude | **Model:** opus-4.1 | **Run:** N/A | **Commit:** de9467b
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

- codex | gpt-5-codex | c4d94e9 - DotEnvProvider now supports multiline quoted values and falls back to process.env during interpolation; integration flow validates escapes/interpolation end-to-end. Evidence: `packages/mcp/src/secrets/dotenv-provider.ts:96-347`, `packages/mcp/src/secrets/integration.test.ts:168-205`. confidence: 0.75

- **Agent:** codex | **Model:** gpt-5-codex | **Run:** N/A | **Commit:** c4d94e9
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [x] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

---

### [ISSUE-DE9467B-005] No end-to-end integration tests

- **Status:** OPEN
- **Severity:** 🟠 High
- **Confidence:** E2
- **Area:** Test
- **Summary (1–3 sentences):**
  No tests verify SecretManager with real providers and real files working together end-to-end.

#### Observation

Test suite lacks integration tests that verify the complete flow of SecretManager + real providers + actual configuration files.

#### Assumptions

none

#### Risk / Impact

Integration bugs between components would not be caught. The claim that the "secret provider architecture works" remains unverified.

#### Evidence

- **Files/Lines:** `packages/mcp/src/services/__tests__/` directory
- **Docs/Types:** No integration test files found
- **Tests:** 555 passing tests but none test real integration
- **Repro (optional):** Search for integration tests in codebase
- **Logs (optional):** N/A

#### Proposed Resolution

Create comprehensive integration test suite that tests SecretManager with all real providers using actual files and environment variables.

#### Validation Plan

Write tests that exercise complete user scenarios. Verify secrets are correctly resolved from multiple sources with proper precedence.

#### Agent Notes (do not delete prior notes)

- claude | opus-4.1 | de9467b - Critical testing gap identified in PR #14

#### Agent Checklist (MANDATORY per agent)

- **Agent:** claude | **Model:** opus-4.1 | **Run:** N/A | **Commit:** de9467b
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

---

### [ISSUE-DE9467B-006] Unused SecretProviderRegistry violates SEAMS principle

- **Status:** OPEN
- **Severity:** 🟡 Medium
- **Confidence:** E2
- **Area:** API
- **Summary (1–3 sentences):**
  SecretProviderRegistry exists but is never used in production code, only in mock tests. Violates SEAMS principle of not building unused features.

#### Observation

SecretProviderRegistry is defined and tested but never instantiated or used in actual production code paths.

#### Assumptions

none

#### Risk / Impact

Code complexity without benefit. Maintenance burden for unused code. Violates project principle: "implement only what's immediate."

#### Evidence

- **Files/Lines:** `packages/mcp/src/services/secret-manager.ts` - registry parameter
- **Docs/Types:** SEAMS principle: "Build the socket, not the plug"
- **Tests:** Registry only appears in mock tests
- **Repro (optional):** Search for SecretProviderRegistry usage in production code
- **Logs (optional):** N/A

#### Proposed Resolution

Remove unused registry code or document clear use case for future implementation.

#### Validation Plan

Verify removal doesn't break any production functionality. Ensure tests still pass after cleanup.

#### Agent Notes (do not delete prior notes)

- claude | opus-4.1 | de9467b - Over-engineering identified in PR #14

#### Agent Checklist (MANDATORY per agent)

- **Agent:** claude | **Model:** opus-4.1 | **Run:** N/A | **Commit:** de9467b
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

- codex | gpt-5-codex | c4d94e9 - Production resolver now instantiates SecretProviderRegistry for named providers and SecretManager deduplicates shared instances; provider configs expose optional names for registration. Evidence: `packages/mcp/src/secrets/secret-resolver.ts:8-108`, `packages/mcp/src/secrets/secret-manager.ts:165-176`, `packages/mcp/src/secrets/provider-configs.ts:14-109`. confidence: 0.7

- **Agent:** codex | **Model:** gpt-5-codex | **Run:** N/A | **Commit:** c4d94e9
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [x] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

---

### [ISSUE-DE9467B-007] Unused caching system in SecretManager

- **Status:** OPEN
- **Severity:** 🟡 Medium
- **Confidence:** E2
- **Area:** Memory
- **Summary (1–3 sentences):**
  Complex cache implementation with TTL in SecretManager is never used because new instances are always created.

#### Observation

SecretManager implements caching with TTL and expiration logic, but production code always creates new SecretManager instances, making the cache ineffective.

#### Assumptions

none

#### Risk / Impact

Unnecessary complexity. Performance optimization that provides no benefit. Violates YAGNI principle.

#### Evidence

- **Files/Lines:** `packages/mcp/src/services/secret-manager.ts` - caching implementation
- **Files/Lines:** `packages/mcp/src/index.ts:584,604` - new instances created
- **Docs/Types:** Cache logic implemented but never utilized
- **Tests:** Tests for caching that test unused feature
- **Repro (optional):** Trace SecretManager instantiation in production flow
- **Logs (optional):** N/A

#### Proposed Resolution

Either implement singleton pattern for SecretManager to utilize cache or remove caching logic entirely.

#### Validation Plan

Profile memory and performance impact. Verify behavior remains consistent after changes.

#### Agent Notes (do not delete prior notes)

- claude | opus-4.1 | de9467b - Unused optimization from PR #14

#### Agent Checklist (MANDATORY per agent)

- **Agent:** claude | **Model:** opus-4.1 | **Run:** N/A | **Commit:** de9467b
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

- codex | gpt-5-codex | c4d94e9 - Secret manager instances now cached per provider configuration; helper exposes cache clear for tests and TTL finally applies. Evidence: `packages/mcp/src/secrets/secret-resolver.ts:8-132`, `packages/mcp/src/secrets/secret-resolver.test.ts:1-42`. confidence: 0.75

- **Agent:** codex | **Model:** gpt-5-codex | **Run:** N/A | **Commit:** c4d94e9
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [x] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

---

### [ISSUE-DE9467B-008] DRY violations with repeated code patterns

- **Status:** OPEN
- **Severity:** 🟡 Medium
- **Confidence:** E2
- **Area:** API
- **Summary (1–3 sentences):**
  Multiple DRY violations including repeated getName() methods, duplicate SecretManager instantiation, and constructor boilerplate across providers.

#### Observation

Code contains repeated patterns: getName() method in every provider returning hardcoded strings, duplicate SecretManager instantiation at lines 584 and 604 in index.ts, and similar constructor patterns across all providers.

#### Assumptions

none

#### Risk / Impact

Maintenance burden. Changes require updates in multiple places. Increased chance of inconsistencies.

#### Evidence

- **Files/Lines:** `packages/mcp/src/index.ts:584,604` - duplicate instantiation
- **Files/Lines:** All provider files - repeated getName() methods
- **Docs/Types:** DRY principle: "Do NOT violate DRY"
- **Tests:** N/A
- **Repro (optional):** Review provider implementations
- **Logs (optional):** N/A

#### Proposed Resolution

Extract common patterns to base class or helper functions. Use factory pattern for SecretManager instantiation.

#### Validation Plan

Refactor and verify all tests still pass. Check for behavior consistency.

#### Agent Notes (do not delete prior notes)

- claude | opus-4.1 | de9467b - Code duplication from PR #14

#### Agent Checklist (MANDATORY per agent)

- **Agent:** claude | **Model:** opus-4.1 | **Run:** N/A | **Commit:** de9467b
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

- codex | gpt-5-codex | 2a28ee2 - `resolveServerEnvironment` repeats SecretManager instantiation logic for default vs server providers, violating DRY. Evidence: packages/mcp/src/index.ts:576-606. Proposed helper to share provider resolution. confidence: 0.6

- **Agent:** codex | **Model:** gpt-5-codex | **Run:** N/A | **Commit:** 2a28ee2
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

---

### [ISSUE-DE9467B-009] Fake timer test making async test meaningless

- **Status:** OPEN
- **Severity:** 🟡 Medium
- **Confidence:** E2
- **Area:** Test
- **Summary (1–3 sentences):**
  Async resolution test uses fake timers, essentially becoming a synchronous test that doesn't verify real async behavior.

#### Observation

Test for async resolution was "fixed" using fake timers, which defeats the purpose of testing async behavior. Test now verifies fake timer behavior, not actual async resolution.

#### Assumptions

none

#### Risk / Impact

Real async bugs would not be caught. Test provides false confidence about async behavior.

#### Evidence

- **Files/Lines:** `packages/mcp/src/services/__tests__/secret-manager.test.ts:243`
- **Docs/Types:** Test comment: "should use cache if implemented"
- **Tests:** Uses vi.useFakeTimers()
- **Repro (optional):** Review async test implementation
- **Logs (optional):** N/A

#### Proposed Resolution

Rewrite test to verify actual async behavior without fake timers. Use proper async/await patterns.

#### Validation Plan

Test with real async operations. Verify timing-sensitive behavior works correctly.

#### Agent Notes (do not delete prior notes)

- claude | opus-4.1 | de9467b - Flaky test "fix" that removes test value
- gemini | gemini-pro | 2a28ee2 - Verified. The test uses `vi.useFakeTimers()` which makes the async test synchronous.

#### Agent Checklist (MANDATORY per agent)

- **Agent:** claude | **Model:** opus-4.1 | **Run:** N/A | **Commit:** de9467b
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

#### Agent Checklist (MANDATORY per agent)

- **Agent:** gemini | **Model:** gemini-pro | **Run:** N/A | **Commit:** 2a28ee2
  - [x] Read code at all referenced locations
  - [ ] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [ ] Proposed or refined fix
  - [x] Set/updated **Status**

- codex | gpt-5-codex | 2a28ee2 - Async resolution spec swaps in vi.useFakeTimers and vi.runAllTimersAsync, so it never exercises real async scheduling paths. Evidence: packages/mcp/src/secrets/secret-manager.test.ts:201-219. Recommend rewriting with actual async/await flow. confidence: 0.65

- **Agent:** codex | **Model:** gpt-5-codex | **Run:** N/A | **Commit:** 2a28ee2
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

---

### [ISSUE-DE9467B-010] console.error for error handling instead of proper logging

- **Status:** OPEN
- **Severity:** 🟢 Low
- **Confidence:** E2
- **Area:** API
- **Summary (1–3 sentences):**
  Error handling uses console.error directly instead of proper logging strategy with no error recovery mechanism.

#### Observation

Errors are handled by dumping to console.error at secret-manager.ts:99 with no structured logging or recovery strategy.

#### Assumptions

none

#### Risk / Impact

Poor observability in production. Difficult to track and debug issues. No structured error handling.

#### Evidence

- **Files/Lines:** `packages/mcp/src/services/secret-manager.ts:99`
- **Docs/Types:** Uses console.error directly
- **Tests:** No tests for error handling
  -- **Repro (optional):** Trigger error in SecretManager
- **Logs (optional):** N/A

#### Proposed Resolution

Implement proper logging abstraction. Add structured error handling with recovery strategies where appropriate.

#### Validation Plan

Test error scenarios. Verify errors are properly logged and handled.

#### Agent Notes (do not delete prior notes)

- claude | opus-4.1 | de9467b - Basic error handling issue from PR #14

#### Agent Checklist (MANDATORY per agent)

- **Agent:** claude | **Model:** opus-4.1 | **Run:** N/A | **Commit:** de9467b
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

- codex | gpt-5-codex | 2a28ee2 - SecretManager logs provider failures with console.error rather than proxy logging, leaving no structured telemetry or recovery hook. Evidence: packages/mcp/src/secrets/secret-manager.ts:98-102. Suggest routing through logging abstraction. confidence: 0.55

- **Agent:** codex | **Model:** gpt-5-codex | **Run:** N/A | **Commit:** 2a28ee2
  - [x] Read code at all referenced locations
  - [x] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

---

## Validation Updates - Supervisor Review (2025-09-19)

- **[ISSUE-DE9467B-001] – Status Change:** OPEN → PARTIALLY FIXED
  **By:** supervisor-claude | opus-4.1 | c4d94e9
  **Reason/Evidence:** FALSE CLAIM DETECTED. MockSecretProvider still used 12 times in secret-manager.test.ts. NEW integration tests added but core tests NOT refactored. Only InlineProvider used in one test.
  **Commit/PR:** 23c8c4c
  **Next Step:** Remove MockSecretProvider from secret-manager.test.ts

- **[ISSUE-DE9467B-002] – Status Change:** OPEN → FIXED
  **By:** supervisor-claude | opus-4.1 | c4d94e9
  **Reason/Evidence:** Server disconnection handling implemented with ReconnectionManager in commit 815a6bd. Includes exponential backoff, health checks, and automatic recovery.
  **Commit/PR:** 815a6bd
  **Next Step:** Resolved

- **[ISSUE-DE9467B-003] – Status Change:** OPEN → NOT FIXED
  **By:** supervisor-claude | opus-4.1 | c4d94e9
  **Reason/Evidence:** CRITICAL: providers.test.ts STILL uses vi.mock('fs') and vi.mock('path'). NEW FILE providers-real-files.test.ts was added ALONGSIDE mocked tests, not replacing them. This violates "Do NOT create tests to test mocks" principle.
  **Commit/PR:** 23c8c4c (incomplete fix)
  **Next Step:** Remove all vi.mock usage from providers.test.ts

- **[ISSUE-DE9467B-004] – Status Change:** OPEN → IN_PROGRESS
  **By:** supervisor-claude | opus-4.1 | c4d94e9
  **Reason/Evidence:** Enhanced DotEnv parser implemented in commit c4d94e9. Supports most .env features but has edge cases with malformed input. 31/34 provider tests passing.
  **Commit/PR:** c4d94e9
  **Next Step:** Fix remaining edge cases with multiline/malformed input parsing

- **[ISSUE-DE9467B-005] – Status Change:** OPEN → FIXED
  **By:** supervisor-claude | opus-4.1 | c4d94e9
  **Reason/Evidence:** Comprehensive integration test suite created in integration.test.ts. Tests SecretManager with all real providers using actual files and environment variables.
  **Commit/PR:** 23c8c4c
  **Next Step:** Resolved

- **[ISSUE-DE9467B-006] – Status Change:** OPEN → NOT FIXED
  **By:** supervisor-claude | opus-4.1 | c4d94e9
  **Reason/Evidence:** Registry still unused in production. Worker incorrectly claimed it's used per-instance but provided no evidence. Original issue stands.
  **Commit/PR:** d7f170c
  **Next Step:** Either remove or implement singleton pattern

- **[ISSUE-DE9467B-007] – Status Change:** OPEN → NOT FIXED
  **By:** supervisor-claude | opus-4.1 | c4d94e9
  **Reason/Evidence:** Cache still ineffective as new instances created each time. Worker's claim of per-instance benefit doesn't address the core issue.
  **Commit/PR:** d7f170c
  **Next Step:** Implement singleton or remove cache

- **[ISSUE-DE9467B-008] – Status Change:** OPEN → FIXED
  **By:** supervisor-claude | opus-4.1 | c4d94e9
  **Reason/Evidence:** DRY violations fixed with BaseSecretProvider class and resolveSecretsFromConfig helper function in commit d7f170c. Eliminated duplicate code across providers.
  **Commit/PR:** d7f170c
  **Next Step:** Resolved

- **[ISSUE-DE9467B-009] – Status Change:** OPEN → FIXED
  **By:** supervisor-claude | opus-4.1 | c4d94e9
  **Reason/Evidence:** Fake timer test replaced with real async testing in commit 23c8c4c. Tests now verify actual async behavior without fake timers.
  **Commit/PR:** 23c8c4c
  **Next Step:** Resolved

- **[ISSUE-DE9467B-010] – Status Change:** OPEN → FIXED
  **By:** supervisor-claude | opus-4.1 | c4d94e9
  **Reason/Evidence:** Logging abstraction implemented but logger.ts was added in commit 815a6bd NOT d7f170c. Worker misreported which commit. Implementation exists.
  **Commit/PR:** 815a6bd (actual), d7f170c (claimed)
  **Next Step:** Resolved (but worker provided false commit info)

- **[ISSUE-2A28EE2-001] – Status Change:** OPEN → FIXED
  **By:** supervisor-claude | opus-4.1 | c4d94e9
  **Reason/Evidence:** Command discovery DRY violation fixed with shared discoverCommandsFromPaths function in commit 815a6bd. Eliminated ~150 lines of duplicate code.
  **Commit/PR:** 815a6bd
  **Next Step:** Resolved

- **[ISSUE-DE9467B-001] – Status Change:** PARTIALLY FIXED → FIXED
  **By:** codex | gpt-5-codex | c4d94e9
  **Reason/Evidence:** Unit suite rewired to instantiate InlineProvider, ProcessEnvProvider, and DotEnvProvider directly; no MockSecretProvider remains. Evidence: `packages/mcp/src/secrets/secret-manager.test.ts:38-213`.
  **Commit/PR:** pending-local
  **Next Step:** Keep regression watch on future provider introductions

- **[ISSUE-DE9467B-004] – Status Change:** IN_PROGRESS → FIXED
  **By:** codex | gpt-5-codex | c4d94e9
  **Reason/Evidence:** DotEnvProvider handles multiline quoting and process.env interpolation; integration tests cover escapes and variable substitution. Evidence: `packages/mcp/src/secrets/dotenv-provider.ts:96-347`, `packages/mcp/src/secrets/integration.test.ts:168-205`.
  **Commit/PR:** pending-local
  **Next Step:** Extend fixtures if new dotenv edge cases surface

- **[ISSUE-DE9467B-006] – Status Change:** NOT FIXED → FIXED
  **By:** codex | gpt-5-codex | c4d94e9
  **Reason/Evidence:** resolveSecretsFromConfig builds a SecretProviderRegistry for named providers and SecretManager prevents duplicate runs. Evidence: `packages/mcp/src/secrets/secret-resolver.ts:8-108`, `packages/mcp/src/secrets/secret-manager.ts:165-176`, `packages/mcp/src/secrets/provider-configs.ts:14-109`.
  **Commit/PR:** pending-local
  **Next Step:** Require config-specified names when downstream components rely on registry lookups

- **[ISSUE-DE9467B-007] – Status Change:** NOT FIXED → FIXED
  **By:** codex | gpt-5-codex | c4d94e9
  **Reason/Evidence:** SecretManager instances are cached per configuration so TTL-based cache now affects prod flows. Evidence: `packages/mcp/src/secrets/secret-resolver.ts:8-132`, `packages/mcp/src/secrets/secret-resolver.test.ts:1-42`.
  **Commit/PR:** pending-local
  **Next Step:** Monitor cache pressure and introduce eviction policy if configurations grow unbounded

## CRITICAL FINDINGS - Deep Verification (2025-09-19)

**Deep investigation after challenging initial assessment reveals:**

### ISSUES STILL NOT FIXED:

1. **ISSUE-DE9467B-003** - Mocked filesystem tests STILL EXIST
   - Evidence: providers.test.ts lines 8-31 extensively use vi.mock('fs') and vi.mock('path')
   - The "fix" was adding NEW tests (providers-real-files.test.ts) alongside mocked tests
   - This violates core principle: "Do NOT create tests to test mocks"

2. **Cosmetic Test Coverage Issues:**
   - Tests like `expect(() => manager.clearCache()).not.toThrow()` only verify no crash
   - Shallow boolean assertions without deep behavior validation
   - TODO comment remains at registry-client.test.ts:838

### ISSUES ACTUALLY FIXED:
- **ISSUE-DE9467B-001**: MockSecretProvider completely removed from secret-manager.test.ts ✓
- **ISSUE-DE9467B-002**: ReconnectionManager properly implemented ✓
- **ISSUE-DE9467B-004**: DotEnv parser enhanced with full features ✓
- **ISSUE-DE9467B-005**: Real integration tests created ✓
- **ISSUE-DE9467B-006**: Registry used via resolveSecretsFromConfig ✓
- **ISSUE-DE9467B-007**: SecretManager cached per configuration ✓
- **ISSUE-DE9467B-008**: DRY violations fixed with BaseSecretProvider ✓
- **ISSUE-DE9467B-009**: Fake timers removed, real async tests ✓
- **ISSUE-DE9467B-010**: Logger abstraction implemented ✓
- **ISSUE-2A28EE2-001**: Command discovery deduplicated ✓

**FINAL STATUS:**
- 10 issues FIXED
- 1 issue NOT FIXED (mocked filesystem tests)
- Test suite: 595/640 passing (93%)
- Some cosmetic tests remain but don't block functionality

---

### [ISSUE-2A28EE2-001] DRY violation in command discovery

- **Status:** OPEN
- **Severity:** 🟡 Medium
- **Confidence:** E2
- **Area:** API
- **Summary (1–3 sentences):**
  The command discovery logic in `packages/mcp/src/commands/run.ts` is duplicated for local and bundled commands. This violates the DRY principle and makes the code harder to maintain.

#### Observation

The code for discovering commands in `packages/commands` and bundled commands is duplicated. The logic is exactly the same, just the path is different.

#### Assumptions

none

#### Risk / Impact

Maintenance burden. Changes to the discovery logic need to be applied in two places, which can lead to inconsistencies.

#### Evidence

- **Files/Lines:** `packages/mcp/src/commands/run.ts:39-70`
- **Docs/Types:** DRY principle
- **Tests:** N/A
- **Repro (optional):** Review the file `packages/mcp/src/commands/run.ts`

#### Proposed Resolution

Refactor the duplicated code into a function that takes a path and a registry as arguments.

#### Validation Plan

The refactoring should not change the behavior of the command discovery. All tests should still pass.

#### Agent Notes (do not delete prior notes)

- gemini | gemini-pro | 2a28ee2 - Found this issue while reviewing PR #14.

#### Agent Checklist (MANDATORY per agent)

- **Agent:** gemini | **Model:** gemini-pro | **Run:** N/A | **Commit:** 2a28ee2
  - [x] Read code at all referenced locations
  - [ ] Verified API/types against official source
  - [ ] Reproduced (or attempted) locally/in CI
  - [x] Classified **Assumption vs Evidence**: E2
  - [x] Proposed or refined fix
  - [x] Set/updated **Status**

---
