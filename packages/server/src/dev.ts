import { startWebServer } from './index.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ProxyConfigSchema,
  normalizeServers,
  type ProxyConfig,
} from 'mcp-funnel';

function loadConfig(): ProxyConfig & {
  servers: Array<{
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
} {
  const configPathEnv = process.env.MCP_FUNNEL_CONFIG_PATH;
  const defaultPath = resolve(process.cwd(), '.mcp-funnel.json');
  const configPath = configPathEnv ?? defaultPath;

  if (existsSync(configPath)) {
    try {
      const txt = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(txt) as unknown;

      // Use ProxyConfigSchema to validate the full configuration
      const validatedConfig = ProxyConfigSchema.parse(parsed);

      // Normalize servers to array format for consistent return type
      const normalizedServers = normalizeServers(validatedConfig.servers);

      return {
        ...validatedConfig,
        servers: normalizedServers,
      };
    } catch (error) {
      console.error(
        `[server] Failed to parse config from ${configPath}:`,
        error,
      );
      // Fall back to empty config only if parsing fails
    }
  }

  return { servers: [] };
}

async function main() {
  const port = process.env.PORT ? Number(process.env.PORT) : 3456;
  const host = process.env.HOST ?? '0.0.0.0';
  const config = loadConfig();

  type ProxyCtor = new (
    config: ReturnType<typeof loadConfig>,
  ) => import('mcp-funnel').MCPProxy;
  const runtime = (await import('mcp-funnel')) as unknown as {
    MCPProxy: ProxyCtor;
  };
  const proxy = new runtime.MCPProxy(config);
  try {
    await proxy.initialize();
  } catch (e) {
    console.error(
      '[server] MCP proxy initialization failed, starting web server without backends:',
      e,
    );
  }
  await startWebServer(proxy, { port, host });
}

main().catch((err) => {
  console.error('[server] Failed to start web server:', err);
  process.exit(1);
});
