# @mcp-funnel/command-ts-unused-code

TypeScript unused code detection command for MCP Funnel - identifies dead code and unused exports using TSR (TypeScript Unused Code Remover).

## Usage

### Via MCP Tool

```typescript
import { detectUnusedCode } from '@mcp-funnel/command-ts-unused-code';

// Example usage (will be implemented in src/index.ts)
const result = await detectUnusedCode({
  paths: ['./src'],
  // ... other options
});
```

### Via CLI

```bash
# From repository root
yarn ts-unused-code ./src

# With specific options
yarn ts-unused-code ./src --include="**/*.ts" --exclude="**/*.test.ts"
```

## Important Notes

⚠️ **False Positives**:

This tool may report false positives in the following scenarios:

- **Dynamic imports**: Code loaded via `import()`, `require()`, or string-based imports
- **Reflection-based usage**: Code accessed via `eval()`, bracket notation, or reflection APIs
- **Framework conventions**: Files used by frameworks through conventions (e.g., Next.js pages, test files)
- **Cross-package dependencies**: Exports used by other packages in monorepos may appear unused
- **Type-only usage**: Types used in comments, documentation, or complex type manipulations
- **Build-time code**: Code eliminated by bundlers but still semantically used
- **External tool integration**: Code referenced by external tools, configs, or documentation

**Recommendation**: Always review flagged code manually before removal. Use this tool as a starting point for cleanup, not an automated solution.

## Development

```bash
# Build the package
yarn build

# Run in watch mode
yarn build:watch

# Test (run from repository root)
cd ../../../ && yarn test
```

## Dependencies

This package uses [TSR (TypeScript Unused Code Remover)](https://github.com/line/ts-remove-unused) as the core detection engine.
