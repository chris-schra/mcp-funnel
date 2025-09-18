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

## Supervisor Verification Protocol

**AFTER EACH WORKER COMPLETES**, the supervisor MUST:
1. [ ] Run `git status` to verify files are tracked
2. [ ] Run `yarn validate packages/mcp` personally
3. [ ] Run `yarn test packages/mcp` personally
4. [ ] Use code-reasoning tool to review changes
5. [ ] Verify that the workers did not fool you with cosmetic tests
6. [ ] Commit all files with `git add` and `git commit`
7. [ ] Update task checkboxes in this document
8. [ ] Only then proceed to dependent tasks

## Before starting

**BEFORE** starting a new phase, you **MUST** create tasks that are optimized for parallel work,
so it should be **NO** work on the same files in parallel.
Then start instances of subagent worker IN PARALLEL to work on the tasks and coordinate them.
Use as many PARALLEL worker instances as useful - CONSIDER dependencies so do NOT launch workers
in parallel that have dependencies that are not implemented or will be worked on in other tasks.

To start parallel subagent workers, you **MUST** send a single message with multiple Task tool calls.

## Problem Statement

Currently, MCP Funnel passes ALL process environment variables to spawned MCP servers (line 551-554 in index.ts):
```typescript
env: { ...process.env, ...targetServer.env }
```

This creates security issues:
- Information leakage: All shell env vars exposed to every server
- Unnecessary exposure: Servers get variables they don't need (PATH, HOME, SSH_AUTH_SOCK, AWS credentials, etc.)
- Cross-contamination: One server's env vars might conflict with another's
- Hardcoded secrets: Users must either hardcode in config or use Docker workarounds

## Solution: Secret Provider Architecture

Implement a pluggable secret provider system that:
1. Controls which environment variables are exposed to servers
2. Supports multiple secret sources (dotenv files, process env, inline, future: Vault, AWS Secrets Manager, etc.)
3. Maintains backward compatibility with existing configurations
4. Follows SEAMS principle - build the socket, not the plug

## Implementation Context (from code-reasoning analysis)

### Existing Infrastructure
- **No external dependencies needed**: Use Node's built-in `fs` module (already used in config-loader.ts)
- **Available utilities**:
  - `readFileSync`, `existsSync` from 'fs' for sync file operations
  - `readFile` from 'fs/promises' for async operations
  - `resolve`, `join` from 'path' for path resolution
  - `deepmerge-ts` package already available for config merging
- **Existing patterns to follow**:
  - config-loader.ts: File reading and JSON parsing patterns
  - Line 551-554 in index.ts: Current env merging location to modify

### Default Environment Variables (overridable)
Following SEAMS, we provide a minimal default list of environment variables that are always passed through, which users can override via `defaultPassthroughEnv` config:

```typescript
// Minimal default if defaultPassthroughEnv is undefined
const DEFAULT_PASSTHROUGH_ENV = [
  'NODE_ENV',  // development/production/test
  'HOME',      // User home directory
  'USER',      // Current user
  'TERM',      // Terminal type
  'CI',        // CI environment flag
  'DEBUG'      // Debug output control
];
```

Users can extend or replace this list by setting `defaultPassthroughEnv` in their config. This minimal default balances security (not exposing unnecessary vars) with functionality (common vars most servers need).

## Iteration Plan:

For each phase,

Phase 1: Interfaces & Types

- Define all TypeScript interfaces and types for the secret management system
- ISecretProvider interface for provider abstraction
- SecretProviderConfig type for configuration
- DotEnvProviderConfig, ProcessEnvProviderConfig, InlineProviderConfig specific configs
- SecretResolutionResult type for resolved secrets with metadata
- SecretProviderRegistry for managing provider instances
- You **MUST** write new files in folder packages/mcp/src/secrets
  - if it's simple types and interfaces, you can write them in packages/mcp/src/secrets/index.ts
  - if types or interfaces have more than 5 lines, they need dedicated files, and those need to be exported via packages/mcp/src/secrets/index.ts
- Update packages/mcp/src/config.ts to add:
  - `secretProviders` field to TargetServerSchema
  - `defaultSecretProviders` field to ProxyConfigSchema
  - `defaultPassthroughEnv` field to ProxyConfigSchema (string array, defaults to ["NODE_ENV", "HOME", "USER", "TERM", "CI", "DEBUG"])

**DO NOT** proceed to next phase until:
- [x] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [x] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [x] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 2: Tests with test.skip

You **MUST** tick the checklist boxes for previous phase before continuing.

- Write comprehensive tests that define expected behavior
- Tests for DotEnvProvider (reading .env files, handling missing files, relative/absolute paths)
- Tests for ProcessEnvProvider (filtering by prefix, allowlist, blocklist)
- Tests for InlineProvider (simple value passthrough)
- Tests for SecretManager (provider precedence, merging, caching)
- Tests for config schema validation with secretProviders
- Tests for backward compatibility (existing env field still works)
- All tests initially skipped but validate against types

**DO NOT** proceed to next phase until:
- [x] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [x] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [x] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 3: Implementation

You **MUST** tick the checklist boxes for previous phase before continuing.

- Core implementations:
    - SecretManager class to orchestrate providers
    - DotEnvProvider for reading .env files (simple parser implementation):
      * Read file with readFileSync
      * Parse line by line (split on \n)
      * Handle comments (lines starting with #) and empty lines
      * Split on first = for key-value pairs
      * Trim whitespace, handle quoted values
      * No external dotenv package needed
    - ProcessEnvProvider with filtering capabilities (prefix, allowlist, blocklist)
    - InlineProvider for explicit values from config
    - SecretProviderRegistry for provider registration and lifecycle
- Integration:
    - Update MCPProxy to use SecretManager in connectToTargetServers
    - Ensure backward compatibility - if no secretProviders, use existing behavior
    - Add proper error handling and logging (never log secret values)
- Security considerations:
    - Validate file permissions on .env files (warning only)
    - Never log secret values
    - Clear separation between secret resolution and usage

**DO NOT** proceed to next phase until:
- [x] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [x] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [x] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 4: Unskip & Run Tests

You **MUST** tick the checklist boxes for previous phase before continuing.

- Enable tests progressively
- Validate implementation matches expected behavior
- Ensure backward compatibility works
- Test with real .env files in different locations
- Validate security features (no logging of secrets, proper filtering)

**DO NOT** proceed to next phase until:
- [x] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [x] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [x] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 5: Documentation & Examples

You **MUST** tick the checklist boxes for previous phase before continuing.

- Update README.md with secret provider documentation
- Add examples for common use cases:
    - Using .env file for GitHub token
    - Filtering process env vars by prefix
    - Combining multiple providers
- Document security best practices
- Add migration guide from existing env field

**DO NOT** complete until:
- [ ] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] Documentation is clear and comprehensive
- [ ] Examples are working and tested

Key Implementation Details:

- Provider precedence: Later providers override earlier ones in config
- Default behavior: If no secretProviders, maintain current behavior for backward compat
- Extension points: All Phase 2 features (Vault, AWS, etc.) plug in without refactoring
- Security first: Default to restrictive (don't pass all env vars)
- Async resolution: All providers must support async secret resolution

## Configuration Examples

### Current (insecure) behavior:
```json
{
  "servers": {
    "github": {
      "command": "docker",
      "args": ["run", "--env-file", ".env", "-i", "--rm", "ghcr.io/github/github-mcp-server"]
    }
  }
}
```

### New secure approach:
```json
{
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "secretProviders": [
        { "type": "dotenv", "config": { "path": ".env" } },
        { "type": "process", "config": { "allowlist": ["NODE_ENV"] } }
      ]
    }
  }
}
```

### Global default providers:
```json
{
  "defaultSecretProviders": [
    { "type": "dotenv", "config": { "path": ".env" } },
    { "type": "process", "config": { "prefix": "MCP_" } }
  ],
  "defaultPassthroughEnv": [
    "NODE_ENV", "HOME", "USER", "TERM", "CI", "DEBUG"
  ],
  "servers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"]
    }
  }
}
```

Note: `defaultPassthroughEnv` allows overriding the built-in list of always-passed environment variables. If not specified, defaults to: `["NODE_ENV", "HOME", "USER", "TERM", "CI", "DEBUG"]`.

## Success Criteria

1. [x] No breaking changes - existing configurations continue to work
2. [x] Security improved - servers only get necessary env vars
3. [x] Extensible design - easy to add new providers in Phase 2
4. [x] Well-tested - comprehensive test coverage
5. [ ] Well-documented - clear examples and migration guide
6. [x] Performance - minimal overhead for secret resolution
7. [x] Error handling - graceful degradation when providers fail