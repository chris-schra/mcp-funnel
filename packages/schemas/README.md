# @mcp-funnel/schemas

Zod schemas for validating `.mcp-funnel.json` configuration files.

## Responsibility

Exports validation for MCP Funnel configuration structure and provides TypeScript types via Zod schema inference.

## Installation

```bash
yarn add @mcp-funnel/schemas
```

## Core Exports

- **ProxyConfigSchema** - Validates root `.mcp-funnel.json` structure
- **TargetServerSchema** - Validates individual server configurations
- **ProxyConfig** type - Inferred TypeScript type for config
- **TargetServer** type - Inferred TypeScript type for server

## Usage

```typescript
import { ProxyConfigSchema, type ProxyConfig } from '@mcp-funnel/schemas';

const result = ProxyConfigSchema.safeParse(rawConfig);
if (result.success) {
  const config: ProxyConfig = result.data;
  // Type-safe configuration access
}
```

## Schema Coverage

- Server configurations (stdio, SSE, WebSocket, HTTP transports)
- Authentication (bearer, OAuth2 flows)
- Secret providers (dotenv, process, inline)
- Tool filtering (expose/hide patterns)
- Auto-reconnection settings
- Command configurations

## For Developers

Internal infrastructure package used by `@mcp-funnel/server` for config validation at startup. Depends on `@mcp-funnel/auth` for OAuth2 schemas.

## License

MIT
