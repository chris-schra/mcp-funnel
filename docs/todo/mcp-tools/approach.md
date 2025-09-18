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

## Preflight Checklist

You **MUST** do the following **BEFORE** creating tasks **and** tick the checkboxes:

- [ ] Analyze existing infrastructure and files that might be relevant
- [ ] Check for usage of existing packages
- [ ] Before introducing new external packages from NPM, make sure to enable tool npm, also check if we already use a similar package

## Supervisor Verification Protocol

**AFTER EACH WORKER COMPLETES**, the supervisor MUST:

1. [ ] Run `git status` to verify files are tracked
2. [ ] Run `yarn validate packages/commands/core` personally
3. [ ] Run `yarn test packages/commands/core` personally
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

Currently, MCP Funnel commands cannot:

- Declare dependencies on MCP servers configured in `.mcp-funnel.json`
- Check if required servers are available before execution
- Request that server tools be exposed when needed
- Provide clear error messages when dependencies are missing

This limits the ability to create commands that leverage existing MCP infrastructure, such as:

- A command that uses Codex CLI's MCP mode for reasoning
- A command that requires GitHub MCP for repository operations
- A command that needs filesystem MCP for file access

## Solution: Server Dependency System for Commands

Implement a `requireServer()` method in BaseCommand that:

1. Checks if specified MCP servers are configured
2. Optionally ensures their tools are exposed
3. Returns simple, extensible status information
4. Follows SEAMS principle - start minimal, allow growth

## Implementation Context (from discussion)

### Design Decisions Made

- **Simple return type**: `{ configured: boolean } | undefined` for MVP
- **Clear naming**: `ensureToolsExposed` instead of complex alternatives
- **User approval model**: Configuration in `.mcp-funnel.json` IS the approval
- **SEAMS approach**: Start minimal, add complexity only when needed

### Existing Infrastructure to Leverage

- `BaseCommand` class in `packages/commands/core/src/base-command.ts`
- `ICommand` interface in `packages/commands/core/src/interfaces.ts`
- MCPProxy instance available to commands during execution
- Existing server configuration in `.mcp-funnel.json`

## Iteration Plan:

For each phase,

Phase 1: Types & Interfaces

- Define TypeScript types for server dependency system
- ServerDependency interface with:
  - `aliases: string[]` - List of server names to match
  - `ensureToolsExposed?: boolean` - Whether to auto-expose tools
- ServerRequirementResult type: `{ configured: boolean } | undefined`
- Update ICommand interface to include optional `getServerDependencies()` method
- Location: packages/commands/core/src/
  - Add types to interfaces.ts or create server-dependency.ts if complex
  - Export via index.ts

**DO NOT** proceed to next phase until:

- [x] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [x] `yarn validate packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn test packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES (no tests exist yet)
- [x] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 2: Tests with test.skip

You **MUST** tick the checklist boxes for previous phase before continuing.

- Write comprehensive tests for requireServer() behavior
- Test cases:
  - Server found by first alias
  - Server found by second/third alias
  - Server not found (returns `{ configured: false }`)
  - Undefined when no proxy available
  - ensureToolsExposed flag behavior
  - Multiple requireServer calls
- Mock MCPProxy behavior appropriately
- All tests initially skipped but validate against types
- Location: packages/commands/core/src/**tests**/server-dependency.test.ts

**DO NOT** proceed to next phase until:

- [x] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [x] `yarn validate packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn test packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES
- [x] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 3: Implementation in BaseCommand

You **MUST** tick the checklist boxes for previous phase before continuing.

- Implement `requireServer()` method in BaseCommand
- Add `getProxy()` protected method if not exists
- Implement server lookup logic:
  - Check each alias against configured servers
  - Return appropriate status
  - Handle ensureToolsExposed if requested
- Add optional `getServerDependencies()` to return declared dependencies
- Ensure backward compatibility - existing commands continue to work
- Error handling for edge cases

**DO NOT** proceed to next phase until:

- [x] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [x] `yarn validate packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn test packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES
- [x] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 4: Integration with MCPProxy

You **MUST** tick the checklist boxes for previous phase before continuing.

- Add necessary methods to MCPProxy:
  - `hasServerConfigured(name: string): boolean`
  - `markServerToolsForExposure(name: string): Promise<void>`
- Update command execution flow to pass proxy reference
- Ensure commands can access proxy during both CLI and MCP execution
- Test integration between commands and proxy

**DO NOT** proceed to next phase until:

- [x] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [x] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn validate packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn test packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES
- [x] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 5: Fix Critical Phase 4 Issues

You **MUST** tick the checklist boxes for previous phase before continuing.

**CRITICAL ISSUES TO FIX:**

1. Missing required methods in MCPProxy
2. CLI execution doesn't pass proxy to commands
3. Wrong semantics - checking connected instead of configured servers
4. TODO comments not cleaned up from Phase 4

**Implementation Tasks:**

1. **Update IMCPProxy interface** (packages/commands/core/src/interfaces.ts):
   - Add `hasServerConfigured(name: string): boolean`
   - Add `isServerConnected(name: string): boolean`
   - Keep existing methods for compatibility

2. **Implement methods in MCPProxy** (packages/mcp/src/index.ts):
   - `hasServerConfigured(name: string): boolean` - check if server exists in \_normalizedServers
   - `isServerConnected(name: string): boolean` - check if server exists in connectedServers Map

3. **Refactor BaseCommand methods** (packages/commands/core/src/base-command.ts):
   - Rename existing `requireServer()` to `requireServerConnected()`
   - Create new `requireServerConfigured()` that checks configuration only
   - Remove ALL TODO/Phase 4 comments
   - Both methods should use the new MCPProxy methods

4. **Fix CLI execution** (packages/mcp/src/commands/run.ts):
   - Create a minimal proxy instance or configuration reader
   - Pass it to commands via setProxy() before executeViaCLI()
   - Ensure commands can check server configuration even in CLI mode

5. **Update all tests** (packages/commands/core/src/**tests**/server-dependency.test.ts):
   - Update test names to reflect new method names
   - Test both requireServerConfigured and requireServerConnected
   - Ensure tests cover CLI execution scenario

**DO NOT** proceed to next phase until:

- [x] All TODO/Phase 4 comments are removed from the codebase
- [x] hasServerConfigured() and isServerConnected() are implemented in MCPProxy
- [x] requireServerConfigured() and requireServerConnected() work correctly in BaseCommand
- [x] CLI execution passes proxy/config to commands
- [x] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn validate packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn test packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES
- [x] you did a thorough review using code-reasoning tool to ensure no worker fooled you

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 5: Enable Tool Invocation from Commands

You **MUST** tick the checklist boxes for previous phase before continuing.

**CRITICAL GAP IDENTIFIED:**
Commands can check server dependencies but cannot actually USE those servers' tools.
This phase adds the missing capability for commands to invoke tools from dependent servers.

**Implementation Tasks:**

1. **Add tool invocation method to IMCPProxy interface** (packages/commands/core/src/interfaces.ts):
   - Add `callServerTool(serverName: string, toolName: string, args: Record<string, unknown>): Promise<CallToolResult>`
   - Document that this allows commands to invoke tools from other connected servers

2. **Implement callServerTool in MCPProxy** (packages/mcp/src/index.ts):
   - Check if server is connected
   - Format tool name as `${serverName}__${toolName}`
   - Delegate to existing handleCallToolRequest method
   - Return error if server not connected or tool not found

3. **Implement stub in CLIProxy** (packages/mcp/src/commands/run.ts):
   - Return error indicating tool invocation not available in CLI mode
   - Suggest running via MCP mode for full functionality

4. **Add protected helper method in BaseCommand** (packages/commands/core/src/base-command.ts):
   - `callDependencyTool(serverName: string, toolName: string, args: Record<string, unknown>)`
   - Check proxy exists, delegate to proxy.callServerTool
   - Provide helpful error messages

5. **Write comprehensive tests** (packages/commands/core/src/**tests**/server-dependency.test.ts):
   - Test successful tool invocation
   - Test error handling for disconnected servers
   - Test error handling in CLI mode
   - Test invalid server/tool names

**DO NOT** proceed to next phase until:

- [ ] callServerTool method added to IMCPProxy interface
- [ ] MCPProxy implementation delegates to handleCallToolRequest correctly
- [ ] CLIProxy returns appropriate error for CLI mode
- [ ] BaseCommand helper method provides good developer experience
- [ ] Tests cover all scenarios
- [ ] `yarn validate packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn validate packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/mcp` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES
- [ ] you did a thorough review using code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 6: Unskip & Run Tests

You **MUST** tick the checklist boxes for previous phase before continuing.

- Enable tests progressively
- Validate implementation matches expected behavior
- Test with real command scenarios
- Ensure no breaking changes to existing commands
- Verify server dependency checking works correctly

**DO NOT** proceed to next phase until:

- [x] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [x] `yarn validate packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES
- [x] `yarn test packages/commands/core` passes WITHOUT ANY ERRORS OR ISSUES
- [x] you did a thorough review of all code changes using ultrathink and code-reasoning tool

You **MUST** run above commands **ALWAYS** from package root.

You **MUST** iterate until all issues are resolved **BEFORE** proceeding to next phase.

Phase 7: Example Command & Documentation

You **MUST** tick the checklist boxes for previous phase before continuing.

- Create example command that uses requireServer():
  - CodexBridgeCommand or similar
  - Demonstrates checking for Codex CLI availability
  - Shows proper error handling when not available
- Update packages/commands/core/README.md:
  - Document requireServer() method
  - Explain ServerDependency interface
  - Provide usage examples
  - Document return values and behavior
- Add section on server dependencies to main documentation

**DO NOT** complete until:

- [ ] you did read this file again and make sure that you **ALWAYS** follow these instructions
- [ ] `yarn validate` passes for all packages WITHOUT ANY ERRORS OR ISSUES
- [ ] `yarn test` passes for all packages WITHOUT ANY ERRORS OR ISSUES
- [ ] Documentation is clear and comprehensive
- [ ] Example command works correctly

Key Implementation Details:

- **MVP Focus**: Start with minimal `{ configured: boolean }` return
- **Future Extensions**: Can add `connected`, `toolsExposed`, etc. later
- **No lifecycle management**: Commands don't spawn servers, only check availability
- **Configuration is approval**: If in .mcp-funnel.json, user has approved
- **SEAMS principle**: Build extension points for future enhancements

## Configuration Examples

### Command with server dependency:

```typescript
class CodexBridgeCommand extends BaseCommand {
  async executeViaCLI(args: string[]): Promise<void> {
    const result = await this.requireServer({
      aliases: ['codex', 'codex-cli', 'codex-mcp'],
      ensureToolsExposed: true,
    });

    if (!result?.configured) {
      console.error('Codex CLI not configured. Add to .mcp-funnel.json');
      return;
    }

    // Proceed with command logic
  }
}
```

### Configuration in .mcp-funnel.json:

```json
{
  "servers": {
    "codex": {
      "command": "codex",
      "args": ["--mode", "mcp"]
    }
  },
  "commands": {
    "enabled": true,
    "list": ["codex-bridge"]
  }
}
```

## Success Criteria

1. [ ] Commands can check for server availability
2. [ ] Clear error messages when dependencies missing
3. [ ] No breaking changes to existing commands
4. [ ] Extensible design for future enhancements
5. [ ] Well-tested with comprehensive coverage
6. [ ] Well-documented with clear examples
7. [ ] Minimal performance overhead
8. [ ] Follows SEAMS principle throughout
