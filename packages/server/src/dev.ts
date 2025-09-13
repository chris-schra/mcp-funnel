import { startWebServer } from './index.js';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadConfig(): {
  servers: Array<{
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
  }>;
  hideTools?: string[];
  exposeTools?: string[];
  enableDynamicDiscovery?: boolean;
  hackyDiscovery?: boolean;
} {
  const configPathEnv = process.env.MCP_FUNNEL_CONFIG_PATH;
  const defaultPath = resolve(process.cwd(), '.mcp-funnel.json');
  const configPath = configPathEnv ?? defaultPath;
  if (existsSync(configPath)) {
    const txt = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(txt) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'servers' in parsed &&
      Array.isArray((parsed as { servers: unknown }).servers)
    ) {
      return parsed as ReturnType<typeof loadConfig>;
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
