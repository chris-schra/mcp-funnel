import { startWebServer } from './index.js';
import { resolve } from 'node:path';
import { ProxyConfig, resolveMergedProxyConfig } from 'mcp-funnel';

function loadConfig(): ProxyConfig {
  const configPathEnv = process.env.MCP_FUNNEL_CONFIG_PATH;
  const defaultPath = resolve(process.cwd(), '.mcp-funnel.json');
  const projectPath = configPathEnv ?? defaultPath;

  try {
    const { config } = resolveMergedProxyConfig(projectPath);
    // No need to normalize here since config already has the right type
    return config;
  } catch (error) {
    console.error(
      `[server] Failed to load merged config (project: ${projectPath}):`,
      error,
    );
    return { servers: [] };
  }
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
