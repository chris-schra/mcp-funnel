# MCP Tool System Implementation Plan

## Overview
Create a tool system that exposes development tools both via MCP protocol (for AI assistants) and CLI (for direct command-line usage). The first tool will be `ts-validate`, migrated from the existing `scripts/validate.ts`.

## Architecture Design

### 1. Core Tool Infrastructure (`packages/tools/core`)
- **Base interfaces** for tools that support both MCP and CLI execution
- **Tool registry** for discovering and loading tools
- **Adapter pattern** to bridge MCP tool interface with CLI execution

### 2. First Tool Implementation (`packages/tools/ts-validate`)
- Migrate existing `scripts/validate.ts` functionality
- Implement both MCP tool interface and CLI interface
- Support all existing options (--fix, --json, etc.)

### 3. CLI Integration (`packages/mcp/src/cli.ts`)
- Add `run` subcommand to execute tools from CLI
- Tool discovery and dynamic loading
- Pass through arguments to tools

## Implementation Phases with Subtasks

### Phase 1: Core Tool Package Infrastructure (Foundation)

#### TODO 1.1: Create Core Package Structure
- [ ] Create `packages/tools/core` directory structure
- [ ] Create `packages/tools/core/package.json` with dependencies
- [ ] Create `packages/tools/core/tsconfig.json` for TypeScript config
- [ ] Create `packages/tools/core/src/index.ts` as main export

#### TODO 1.2: Define Tool Interfaces
- [ ] Create `packages/tools/core/src/interfaces.ts` with ITool interface
- [ ] Define MCP execution interface (executeViaMCP)
- [ ] Define CLI execution interface (executeViaCLI)
- [ ] Define tool metadata interface (name, description, schema)

#### TODO 1.3: Create Base Tool Class
- [ ] Create `packages/tools/core/src/base-tool.ts` abstract class
- [ ] Implement common functionality for all tools
- [ ] Add argument parsing helpers
- [ ] Add output formatting helpers

### Phase 2: Tool Registry and Discovery

#### TODO 2.1: Implement Tool Registry
- [ ] Create `packages/tools/core/src/registry.ts` with ToolRegistry class
- [ ] Implement tool registration methods
- [ ] Implement tool lookup methods (by name)
- [ ] Implement MCP tool list generation

#### TODO 2.2: Implement Tool Discovery
- [ ] Create `packages/tools/core/src/discovery.ts` for auto-discovery
- [ ] Implement filesystem scanning for tool packages
- [ ] Implement dynamic import of tool modules
- [ ] Add error handling for invalid tools

### Phase 3: First Tool Implementation (ts-validate)

#### TODO 3.1: Create ts-validate Package Structure
- [ ] Create `packages/tools/ts-validate` directory
- [ ] Create `packages/tools/ts-validate/package.json` with dependencies
- [ ] Create `packages/tools/ts-validate/tsconfig.json`
- [ ] Create `packages/tools/ts-validate/src/index.ts`

#### TODO 3.2: Migrate Validator Logic
- [ ] Copy `scripts/validate.ts` to `packages/tools/ts-validate/src/validator.ts`
- [ ] Refactor to remove CLI-specific code from validator
- [ ] Export MonorepoValidator class and types
- [ ] Ensure all validation logic is preserved

#### TODO 3.3: Implement Tool Wrapper
- [ ] Create `packages/tools/ts-validate/src/tool.ts` implementing ITool
- [ ] Implement executeViaMCP method with JSON output
- [ ] Implement executeViaCLI method with console output
- [ ] Implement getMCPDefinition with proper schema
- [ ] Add argument parsing for both MCP and CLI modes

### Phase 4: CLI and MCP Integration

#### TODO 4.1: Add CLI Run Command
- [ ] Modify `packages/mcp/src/cli.ts` to parse 'run' command
- [ ] Create `packages/mcp/src/commands/run.ts` for tool execution
- [ ] Implement tool discovery and loading
- [ ] Pass arguments to tool's executeViaCLI method
- [ ] Handle errors and exit codes properly

#### TODO 4.2: Integrate Tools with MCP Proxy
- [ ] Modify `packages/mcp/src/mcp-funnel.ts` to load development tools
- [ ] Add tool loading in proxy initialization
- [ ] Register tools with 'tool__' prefix in MCP
- [ ] Handle tool execution requests via MCP protocol
- [ ] Add configuration option to enable/disable tools

### Phase 5: Configuration and Backwards Compatibility

#### TODO 5.1: Update Configuration Schema
- [ ] Modify `packages/mcp/src/config.ts` to add tool configuration
- [ ] Add developmentTools section to config schema
- [ ] Update `.mcp-funnel.example.json` with tool config example
- [ ] Add tool filtering/selection options

#### TODO 5.2: Update Root Package Scripts
- [ ] Test new tool system with `npx mcp-funnel run ts-validate`
- [ ] Update root `package.json` to use new command
- [ ] Ensure backwards compatibility
- [ ] Add migration notes

### Phase 6: Testing and Documentation

#### TODO 6.1: Add Tests
- [ ] Create tests for tool registry
- [ ] Create tests for tool discovery
- [ ] Create tests for ts-validate tool
- [ ] Create integration tests for CLI execution

#### TODO 6.2: Create Documentation
- [ ] Create `packages/tools/README.md` with tool creation guide
- [ ] Document tool interface requirements
- [ ] Add example tool implementation
- [ ] Update main README with tool system info

## Detailed Implementation Tasks

### Task 1: Create Core Tool Package Infrastructure
- [ ] **Gap:** No base infrastructure for tools exists
- [ ] **Files:**
  - `packages/tools/core/package.json`
  - `packages/tools/core/src/index.ts`
  - `packages/tools/core/src/interfaces.ts`
  - `packages/tools/core/src/base-tool.ts`
  - `packages/tools/core/src/registry.ts`
  - `packages/tools/core/tsconfig.json`
- [ ] **Implementation:**
  ```typescript
  // interfaces.ts
  export interface ITool {
    name: string;
    description: string;
    // MCP execution
    executeViaMCP(args: Record<string, unknown>): Promise<CallToolResult>;
    // CLI execution
    executeViaCLI(args: string[]): Promise<void>;
    // Get MCP tool definition
    getMCPDefinition(): Tool;
  }
  ```
- [ ] **Acceptance:** Core package builds successfully with TypeScript
- [ ] **Priority:** 🔴 HIGH - Foundation for all tools

### Task 2: Implement Tool Registry
- [ ] **Gap:** No mechanism to discover and load tools dynamically
- [ ] **Files:**
  - `packages/tools/core/src/registry.ts`
  - `packages/tools/core/src/discovery.ts`
- [ ] **Implementation:**
  ```typescript
  export class ToolRegistry {
    private tools = new Map<string, ITool>();

    register(tool: ITool): void;
    getToolForCLI(name: string): ITool | undefined;
    getAllMCPTools(): Tool[];
    discoverTools(searchPath: string): Promise<void>;
  }
  ```
- [ ] **Acceptance:** Registry can discover and load tools from packages/tools/*
- [ ] **Priority:** 🔴 HIGH - Required for tool loading

### Task 3: Create ts-validate Tool Package
- [ ] **Gap:** validate.ts exists as a script but not as a reusable tool
- [ ] **Files:**
  - `packages/tools/ts-validate/package.json`
  - `packages/tools/ts-validate/src/index.ts`
  - `packages/tools/ts-validate/src/validator.ts` (migrate from scripts/validate.ts)
  - `packages/tools/ts-validate/src/tool.ts` (ITool implementation)
  - `packages/tools/ts-validate/tsconfig.json`
- [ ] **Implementation:**
  ```typescript
  export class TSValidateTool implements ITool {
    name = 'ts-validate';
    description = 'Run prettier, eslint, and TypeScript validation';

    async executeViaMCP(args: Record<string, unknown>) {
      const validator = new MonorepoValidator();
      const options = this.parseMCPArgs(args);
      const result = await validator.validate(options);
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };
    }

    async executeViaCLI(args: string[]) {
      // Parse CLI args and run validator with console output
      const options = this.parseCLIArgs(args);
      const validator = new MonorepoValidator();
      const result = await validator.validate(options);
      this.outputResults(result, args);
    }

    getMCPDefinition(): Tool {
      return {
        name: 'ts-validate',
        description: this.description,
        inputSchema: {
          type: 'object',
          properties: {
            files: { type: 'array', items: { type: 'string' } },
            glob: { type: 'string' },
            fix: { type: 'boolean' },
            cache: { type: 'boolean' }
          }
        }
      };
    }
  }
  ```
- [ ] **Acceptance:** Validator works as both MCP tool and CLI command with same functionality as current script
- [ ] **Priority:** 🔴 HIGH - First tool implementation

### Task 4: Add CLI Run Command
- [ ] **Gap:** CLI only starts MCP proxy, doesn't support running tools directly
- [ ] **Files:**
  - `packages/mcp/src/cli.ts` (modify)
  - `packages/mcp/src/commands/run.ts` (new)
- [ ] **Implementation:**
  ```typescript
  // cli.ts - Add command parsing
  async function main() {
    const command = process.argv[2];

    if (command === 'run') {
      const { runTool } = await import('./commands/run.js');
      const toolName = process.argv[3];
      const toolArgs = process.argv.slice(4);
      await runTool(toolName, toolArgs);
      process.exit(0);
    }

    // Existing proxy startup code...
  }

  // commands/run.ts
  export async function runTool(name: string, args: string[]) {
    const registry = new ToolRegistry();
    await registry.discoverTools(path.join(__dirname, '../../tools'));

    const tool = registry.getToolForCLI(name);
    if (!tool) {
      console.error(`Tool not found: ${name}`);
      process.exit(1);
    }

    await tool.executeViaCLI(args);
  }
  ```
- [ ] **Acceptance:** Can run `npx mcp-funnel run ts-validate --fix`
- [ ] **Priority:** 🔴 HIGH - Required for CLI execution

### Task 5: Integrate Tools with MCP Proxy
- [ ] **Gap:** MCP proxy doesn't expose development tools, only aggregates external servers
- [ ] **Files:**
  - `packages/mcp/src/mcp-funnel.ts` (modify)
  - `packages/mcp/src/tools/development-tools.ts` (new)
- [ ] **Implementation:**
  ```typescript
  // In MCPProxy class
  private async loadDevelopmentTools() {
    if (!this.config.enableDevelopmentTools) return;

    const registry = new ToolRegistry();
    await registry.discoverTools(path.join(__dirname, '../tools'));

    for (const tool of registry.getAllMCPTools()) {
      this.server.setRequestHandler(
        CallToolRequestSchema,
        async (request) => {
          if (request.params.name === `dev__${tool.name}`) {
            const devTool = registry.getToolForCLI(tool.name);
            return devTool?.executeViaMCP(request.params.arguments);
          }
          // Existing tool handling...
        }
      );
    }
  }
  ```
- [ ] **Acceptance:** Development tools appear in MCP tool list with `dev__` prefix
- [ ] **Priority:** 🟡 MEDIUM - MCP exposure

### Task 6: Update Root Package Scripts
- [ ] **Gap:** Root package.json uses direct script path instead of tool system
- [ ] **Files:**
  - `package.json` (modify root)
- [ ] **Implementation:**
  ```json
  {
    "scripts": {
      "validate": "npx mcp-funnel run ts-validate --fix"
    }
  }
  ```
- [ ] **Acceptance:** `yarn validate` works with new tool system
- [ ] **Priority:** 🟡 MEDIUM - Maintain backwards compatibility

### Task 7: Add Tool Discovery Configuration
- [ ] **Gap:** No way to configure which tools are enabled
- [ ] **Files:**
  - `packages/mcp/src/config.ts` (modify)
  - `.mcp-funnel.example.json` (update)
- [ ] **Implementation:**
  ```typescript
  // config.ts - Add to ProxyConfigSchema
  developmentTools: z.object({
    enabled: z.boolean().default(false),
    tools: z.array(z.string()).optional(),
    searchPaths: z.array(z.string()).default(['./packages/tools'])
  }).optional()
  ```
  ```json
  // .mcp-funnel.example.json
  {
    "developmentTools": {
      "enabled": true,
      "tools": ["ts-validate"],
      "searchPaths": ["./packages/tools"]
    }
  }
  ```
- [ ] **Acceptance:** Tools can be enabled/disabled via config
- [ ] **Priority:** 🟢 LOW - Configuration enhancement

### Task 8: Create Tool Documentation
- [ ] **Gap:** No documentation for creating new tools
- [ ] **Files:**
  - `packages/tools/README.md`
  - `packages/tools/core/README.md`
  - `packages/tools/ts-validate/README.md`
- [ ] **Implementation:**
  - Document tool interface requirements
  - Provide example tool implementation
  - Explain dual MCP/CLI execution model
  - Tool discovery mechanism
- [ ] **Acceptance:** Clear documentation for tool creators
- [ ] **Priority:** 🟢 LOW - Documentation

### Task 9: Add Tests for Tool System
- [ ] **Gap:** No tests for new tool infrastructure
- [ ] **Files:**
  - `packages/tools/core/src/registry.test.ts`
  - `packages/tools/ts-validate/src/tool.test.ts`
- [ ] **Implementation:**
  - Test tool discovery
  - Test CLI execution
  - Test MCP execution
  - Test argument parsing
- [ ] **Acceptance:** Test coverage for critical paths
- [ ] **Priority:** 🟢 LOW - Testing

## Migration Path
1. Keep `scripts/validate.ts` working during transition
2. Test new tool system in parallel
3. Switch root package.json once verified
4. Deprecate old script after successful migration

## Success Criteria
- ✅ Can run `npx mcp-funnel run ts-validate --fix` from CLI
- ✅ ts-validate tool appears in MCP tool list as `dev__ts-validate`
- ✅ AI assistants can call ts-validate via MCP
- ✅ Existing `yarn validate` continues to work
- ✅ Tool system is extensible for future tools
- ✅ Tools can be enabled/disabled via configuration
- ✅ Both MCP and CLI interfaces work correctly

## Future Tools
Once the infrastructure is in place, we can add:
- `npm-search`: Search npm packages
- `test-runner`: Run vitest with various options
- `dependency-analyzer`: Analyze and update dependencies
- `git-workflow`: Automated git operations
- `bundle-analyzer`: Analyze bundle sizes