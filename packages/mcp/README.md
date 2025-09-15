# MCP Funnel Core Package

This package contains the core implementation of MCP Funnel, a proxy that aggregates multiple MCP servers with advanced tool filtering and override capabilities.

## Installation

```bash
npm install mcp-funnel
# or
yarn add mcp-funnel
```

## Programmatic Usage

### Basic Setup

```typescript
import { MCPProxy } from 'mcp-funnel';

const config = {
  servers: [
    {
      name: 'github',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-github'],
      env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN }
    }
  ],
  exposeTools: ['github__create_issue', 'github__list_issues'],
  toolOverrides: {
    'github__create_issue': {
      title: '⚠️ Create GitHub Issue',
      description: 'Creates a new issue with validation'
    }
  }
};

const proxy = new MCPProxy(config);
await proxy.start();
```

### Tool Override System

The package exports several classes for managing tool overrides:

#### OverrideManager

Handles static tool overrides defined in configuration:

```typescript
import { OverrideManager } from 'mcp-funnel';

const overrides = {
  'github__*': {
    annotations: {
      category: 'github-operations'
    }
  },
  'memory__store_memory': {
    name: 'memory__save',  // Rename the tool
    title: 'Save to Memory',
    inputSchema: {
      strategy: 'deep-merge',
      properties: {
        importance: {
          type: 'string',
          enum: ['low', 'medium', 'high']
        }
      }
    }
  }
};

const manager = new OverrideManager(overrides);
const overriddenTool = manager.applyOverrides(originalTool, 'memory__store_memory');
```

#### DynamicOverrideManager

Allows runtime modification of tool overrides:

```typescript
import { MCPProxy, DynamicOverrideManager } from 'mcp-funnel';

const proxy = new MCPProxy(config);
const dynamicManager = new DynamicOverrideManager(proxy);

// Add or update overrides at runtime
await dynamicManager.setOverride('github__create_issue', {
  title: '⚠️ ${originalTitle}',  // Template placeholders supported
  description: 'MODIFIED: ${originalDescription}',
  inputSchema: {
    strategy: 'merge',
    properties: {
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high'],
        default: 'medium'
      }
    }
  }
});

// Update multiple overrides at once
await dynamicManager.updateOverrides({
  'github__create_issue': { /* override */ },
  'github__update_issue': { /* override */ },
  'memory__*': { /* pattern override */ }
});

// Remove specific override
await dynamicManager.removeOverride('github__create_issue');

// Get current overrides
const currentOverrides = dynamicManager.getCurrentOverrides();

// Clear all overrides
await dynamicManager.clearAllOverrides();
```

#### OverrideValidator

Validates override configurations for type safety:

```typescript
import { OverrideValidator } from 'mcp-funnel';

const validator = new OverrideValidator();
const validation = validator.validateOverride(originalTool, overriddenTool);

if (!validation.valid) {
  console.error('Invalid override:', validation.errors);
}

if (validation.warnings.length > 0) {
  console.warn('Override warnings:', validation.warnings);
}
```

### Template Placeholders

Override titles and descriptions support template placeholders:

- `${originalName}` - The original tool name
- `${originalTitle}` - The original title (falls back to name if no title)
- `${originalDescription}` - The original description

```typescript
const overrides = {
  '*__delete_*': {
    title: '⚠️ ${originalTitle}',
    description: 'DANGER: ${originalDescription}. This action cannot be undone!'
  }
};
```

### Override Strategies

Input schema overrides support three strategies:

1. **replace**: Completely replace the schema
2. **merge**: Shallow merge of properties
3. **deep-merge**: Recursive merge using `deepmerge-ts`

```typescript
{
  inputSchema: {
    strategy: 'deep-merge',  // or 'merge' or 'replace'
    properties: {
      nested: {
        type: 'object',
        properties: {
          field: { type: 'string' }
        }
      }
    }
  }
}
```

### Configuration Types

```typescript
import { ProxyConfig, ToolOverride } from 'mcp-funnel';

const config: ProxyConfig = {
  servers: [ /* ... */ ],
  exposeTools: ['tool1', 'tool2'],
  hideTools: ['debug_*'],
  exposeCoreTools: ['discover_tools_by_words'],
  toolOverrides: { /* ... */ },
  overrideSettings: {
    allowPreRegistration: false,
    warnOnMissingTools: true,
    applyToDynamic: true,
    validateOverrides: true
  }
};
```

## Exports

The package exports the following:

### Main Classes
- `MCPProxy` - The main proxy server class
- `OverrideManager` - Static override management
- `DynamicOverrideManager` - Runtime override management
- `OverrideValidator` - Override validation

### Configuration
- `ProxyConfig` - TypeScript type for configuration
- `ProxyConfigSchema` - Zod schema for validation
- `normalizeServers` - Helper to normalize server configurations

### Utilities
- `getUserDir()` - Get user configuration directory
- `getUserBasePath()` - Get user config file path
- `getDefaultProjectConfigPath()` - Get default project config path
- `resolveMergedProxyConfig()` - Merge user and project configs

## Development

```bash
# Install dependencies
yarn install

# Run tests
yarn test:overrides

# Build the package
yarn build

# Run in development mode
yarn dev
```

## Architecture

The package follows a modular architecture:

- `src/index.ts` - Main proxy implementation
- `src/overrides/` - Override system implementation
  - `override-manager.ts` - Static override handling
  - `dynamic-overrides.ts` - Runtime override management
  - `override-validator.ts` - Validation logic
- `src/tools/` - Core tool implementations
- `src/config.ts` - Configuration schemas and types
- `src/config-loader.ts` - Configuration file handling

## License

MIT