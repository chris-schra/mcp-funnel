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


## Before starting

**BEFORE** starting a new phase, you **MUST** create tasks that are optimized for parallel work,
so it should be **NO** work on the same files in parallel.
Then start instances of subagent worker IN PARALLEL to work on the tasks and coordinate them. 
Use as many PARALLEL worker instances as useful - CONSIDER dependencies so do NOT launch workers 
in parallel that have dependencies that are not implemented or will be worked on in other tasks. 

To start parallel subagent workers, you **MUST** send a single message with multiple Task tool calls.

## Iteration Plan:

For each phase, 

Phase 1: Interfaces & Types

- Define all TypeScript interfaces and types for the registry system
- IRegistryCache interface for cache abstraction
- ITemporaryServerManager interface (MVP: tracking only)
- IConfigManager interface (MVP: read-only)
- ServerDetail, Package, Remote types from JSON schema
- Registry search result types (minimal for token efficiency)
- You **MUST** write new files in folder packages/mcp/src/registry
  - if it's simple types and interfaces, you can write them in packages/mcp/src/registry/index.ts
  - if types or interfaces have more than 5 lines, they need dedicated files, and those need to be exported via packages/mcp/src/registry/index.ts

**DO NOT** proceed to next phase until:
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 2: Tests with test.skip

- Write comprehensive tests that define expected behavior
- Tests for cache operations (no-op in MVP)
- Tests for registry client (search, getServer)
- Tests for RegistryContext singleton pattern
- Tests for the two tools (search_registry_tools, get_server_install_info)
- Tests for config generation logic
- All tests initially skipped but validate against types

**DO NOT** proceed to next phase until:
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 3: Implementation

- No-op implementations for extension points:
    - NoOpCache (always returns null)
    - TemporaryServerTracker (logs but doesn't spawn)
    - ReadOnlyConfigManager (logs config changes)
- Core implementations:
    - MCPRegistryClient with search and getServer methods
    - RegistryContext singleton with shared cache
    - Two tools: SearchRegistryTools and GetServerInstallInfo
    - Config generation logic for npm/pypi/oci/remotes

**DO NOT** proceed to next phase until:
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 4: Unskip & Run Tests

- Enable tests progressively
- Validate implementation matches expected behavior
- Ensure singleton pattern works for cache sharing

Key Implementation Details:

- Token efficiency: Search returns minimal info (name, description, id), details fetched on demand
- Extension points: All Phase 2 features plug in without refactoring
- Singleton pattern: RegistryContext shares cache across tools
- MVP focus: No actual spawning, no config writes, just discovery and guidance

**DO NOT** proceed to next phase until:
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.
