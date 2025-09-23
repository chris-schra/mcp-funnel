# ts-unused-code Command Architecture

## Overview
A command that leverages [TSR (TypeScript Remove)](https://github.com/line/tsr) to detect unused exports and modules in TypeScript projects, with special consideration for monorepos and their complex interdependencies.

## Core Implementation

**IMPORTANT NOTE**: This is mocked code ONLY for implementation reference. It is NOT truth.

### Command Structure

```typescript
import { tsr } from 'tsr';
import { ICommand, Tool, CallToolResult } from '@mcp-funnel/commands-core';

export class TsUnusedCodeCommand implements ICommand {
  readonly name = 'ts-unused-code';
  readonly description = 'Detect unused exports and modules using TSR';

  async executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<CallToolResult> {
    const { paths, entryPoints, tsConfigFile, autoFix = false } = args;

    // Call TSR's API
    const result = await tsr({
      entrypoints: this.resolveEntryPoints(entryPoints, paths),
      mode: autoFix ? 'write' : 'check',
      configFile: tsConfigFile || 'tsconfig.json',
      projectRoot: process.cwd(),
    });

    // SEAM: Process results (for now, just pass through)
    const processed = this.processResults(result);

    return {
      content: [{
        type: 'text',
        text: this.formatForAI(processed),
      }],
    };
  }

// note: types are mocked, make sure to use actual types
  type OurResultType = { raw:TSRResultType };

  private processResults(tsrResult:TSRResultType):OurResultType {
    // Phase 1: Just return TSR results as-is
    // Phase 2: Could enhance with metadata, categorization, etc.
    return {
      raw: tsrResult
    };
  }

  private resolveEntryPoints(entryPoints?: unknown, paths?: unknown): RegExp[] {
    if (Array.isArray(entryPoints)) {
      return entryPoints.map(ep =>
        typeof ep === 'string' ? new RegExp(ep) : ep
      );
    }

    // Default: look for common entry points
    return [
      /main\.ts$/,
      /index\.ts$/,
      /src\/index\.ts$/,
    ];
  }

  private formatForAI(result): string {
    return `
## TSR Unused Code Analysis

⚠️ **Important**: Results may include false positives, especially for:
- Dynamic imports
- Reflection-based usage
- Framework conventions (Next.js pages, etc.)
- Cross-package dependencies in monorepos

### Results
${JSON.stringify(result, null, 2)}

### Recommendations
- Review results before removing code
- Check for dynamic imports and framework conventions
- Consider cross-package dependencies in monorepos
- Use dry-run mode first before auto-fixing
`;
  }
}
```

### MCP Tool Definition

**NOTE**: we need to keep in mind that in monorepos, they're usually more than one tsconfig.json
Worst case:

-- repo
-- tsconfig.json
-- tsconfig.base.json
---- packages/package-a/tsconfig.json
---- packages/package-a/tsconfig.build.json
---- packages/package-b/tsconfig.json (extending tsconfig.base.json)
---- packages/package-b/tsconfig.build.json (extending packages/package-b/tsconfig.json)

Most certainly, tsr is able to handle this, but we need to make sure to cover those cases.

```typescript
getMCPDefinitions(): Tool[] {
  return [{
    name: this.name,
    description: this.description,
    inputSchema: {
      type: 'object',
      properties: {
        entryPoints: {
          type: 'array',
          items: { type: 'string' },
          description: 'Entry point patterns (regex strings like "main\\.ts$")'
        },
        tsConfigFile: {
          type: 'string',
          description: 'Path to tsconfig.json',
          default: 'tsconfig.json'
        },
        autoFix: {
          type: 'boolean',
          default: false,
          description: 'Automatically remove unused code (use with caution!)'
        },
        projectRoot: {
          type: 'string',
          description: 'Project root directory',
          default: '.'
        }
      }
    }
  }];
}
```

### CLI Implementation

```typescript
async executeViaCLI(args: string[]): Promise<void> {
  const flags = args.filter(a => a.startsWith('--'));
  const positional = args.filter(a => !a.startsWith('--'));

  if (flags.includes('--help')) {
    console.log(`
Usage: mcp-funnel run ts-unused-code [entrypoint-pattern] [options]

Options:
  --write         Remove unused code (default: check only)
  --config FILE   Path to tsconfig.json
  --json          Output as JSON
  --help          Show this help

Examples:
  mcp-funnel run ts-unused-code "src/index.ts"
  mcp-funnel run ts-unused-code "main\\.ts$" --write
  mcp-funnel run ts-unused-code --config tsconfig.build.json
`);
    return;
  }

  const result = await tsr({
    entrypoints: positional.length > 0
      ? [new RegExp(positional[0])]
      : [/index\.ts$/, /main\.ts$/],
    mode: flags.includes('--write') ? 'write' : 'check',
    configFile: this.extractFlag(flags, '--config') || 'tsconfig.json',
    projectRoot: process.cwd(),
  });

  if (flags.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    // Human-readable output
    if (result.unusedExports?.length || result.unusedFiles?.length) {
      console.log('Unused code found:');
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('✨ No unused code detected');
    }
  }
}
```

## Package Structure

```
packages/commands/ts-unused-code/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts      # Export the command
│   └── command.ts    # Command implementation
├── tests/
│   └── command.test.ts
└── README.md
```

### package.json

NOTE: see packages/commands/ts-validate/package.json for reference.
Especially regarding test script and build tooling
```json
{
  "name": "@mcp-funnel/command-ts-unused-code",
  "version": "0.0.1",
  "type": "module",
  "dependencies": {
    "tsr": "^1.3.4",
    "@mcp-funnel/commands-core": "workspace:*"
  }
}
```

## Key Design Decisions

### 1. Simple Integration First
- Use TSR's native API directly
- Pass through TSR results without modification in Phase 1
- Add `processResults()` as a SEAM for future enhancement

### 2. Clear AI Warnings (instructions returned from our tool via MCP to clients like Claude Code CLI)
- Always warn about false positives
- Consider common false positive scenarios
- TSR analyzes from entry points, so cross-package deps might appear unused
- Future enhancement: detect package boundaries and adjust analysis
- Clear warnings about monorepo limitations

## Implementation Phases

- [ ] Basic TSR integration
- [ ] MCP and CLI interfaces
- [ ] Pass-through results
- [ ] Clear false positive warnings
- [ ] Check mode only by default
- [ ] Monorepo-aware analysis
- [ ] Custom ignore patterns
- [ ] Cross-package dependency detection
- [ ] Framework-specific handlers (Next.js, etc.)
- [ ] Incremental analysis

Abandoned / future ideas:
- [ ] Result categorization (safe/risky removals)
- [ ] Caching for large codebases
- [ ] Integration with ts-validate command

## Usage Examples

### CLI
```bash
# Check for unused code from main.ts entry
mcp-funnel run ts-unused-code "main\\.ts$"

# Check with custom tsconfig
mcp-funnel run ts-unused-code --config tsconfig.build.json

# Auto-fix (remove unused code) - use with caution!
mcp-funnel run ts-unused-code --write

# JSON output for scripting
mcp-funnel run ts-unused-code --json
```

### MCP
```json
{
  "tool": "ts-unused-code",
  "arguments": {
    "entryPoints": ["src/index\\.ts$"],
    "tsConfigFile": "tsconfig.json",
    "autoFix": false
  }
}
```

## Extension Points (SEAMS)

Following the SEAMS principle, we have clear extension points:

1. **processResults()** - Transform TSR output before returning
2. **resolveEntryPoints()** - Smart entry point detection
3. **formatForAI()** - Customize output for AI consumption

These allow future enhancements without major refactoring.

## Notes

- Monitor for TypeScript compatibility issues
- False positives are expected - always emphasize caution in output