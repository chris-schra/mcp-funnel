import { MCPProxy } from './index.js';
import { ProxyConfig, normalizeServers } from './config.js';
import { mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logEvent, logError } from './logger.js';
import { getUserBasePath, resolveMergedProxyConfig } from './index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR = resolve(__dirname, '../.logs');
try {
  mkdirSync(LOG_DIR, { recursive: true });
} catch {
  // Directory creation failed, but logging will still work if dir exists
}

// Global error handlers
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  logError('uncaught-exception', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  logError('unhandled-rejection', reason);
  process.exit(1);
});

async function main() {
  // Establish a run id early for correlation
  if (!process.env.MCP_FUNNEL_RUN_ID) {
    process.env.MCP_FUNNEL_RUN_ID = `${Date.now()}-${process.pid}`;
  }
  logEvent('info', 'cli:start', { argv: process.argv, cwd: process.cwd() });
  // Config resolution:
  // 1. Explicit: npx mcp-funnel path/to/config.json
  // 2. Implicit: npx mcp-funnel (uses .mcp-funnel.json from cwd)
  // Check for 'run' command
  if (process.argv[2] === 'run') {
    const { runCommand } = await import('./commands/run.js');
    const commandName = process.argv[3];

    if (!commandName) {
      console.error('Usage: npx mcp-funnel run <command> [...args]');
      console.error('Example: npx mcp-funnel run validate --fix');
      process.exit(1);
    }

    const commandArgs = process.argv.slice(4);
    await runCommand(commandName, commandArgs);
    return; // Exit after running tool
  }

  const configPath = process.argv[2] || '.mcp-funnel.json';
  const resolvedPath = resolve(process.cwd(), configPath);

  const projectExists = existsSync(resolvedPath);
  const userBasePath = getUserBasePath();
  const userBaseExists = existsSync(userBasePath);

  if (!projectExists && !userBaseExists) {
    // Preserve existing UX when nothing is configured
    console.error('\nUsage:');
    console.error(
      '  npx mcp-funnel                    # Uses .mcp-funnel.json from current directory',
    );
    console.error(
      '  npx mcp-funnel path/to/config.json # Uses specified config file',
    );
    console.error('\nExample config (.mcp-funnel.json):');
    console.error(
      JSON.stringify(
        {
          servers: [
            {
              name: 'github',
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-github'],
              env: {
                GITHUB_TOKEN: 'your-token-here',
              },
            },
            {
              name: 'memory',
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-memory'],
            },
          ],
          hideTools: [
            'github__list_workflow_runs',
            'github__get_workflow_run_logs',
            'memory__debug_*',
            'memory__dashboard_*',
          ],
        },
        null,
        2,
      ),
    );
    process.exit(1);
  }

  let config: ProxyConfig;
  try {
    // Merge user base and project config; project overrides user
    const merged = resolveMergedProxyConfig(resolvedPath);
    config = merged.config;
  } catch (error) {
    console.error('Failed to load configuration:', error);
    logError('config-load', error, { path: resolvedPath });
    process.exit(1);
  }

  const normalizedServers = normalizeServers(config.servers);
  logEvent('info', 'cli:config_loaded', {
    path: resolvedPath,
    servers: normalizedServers.map((s) => ({
      name: s.name,
      cmd: s.command,
    })),
  });

  const proxy = new MCPProxy(config);
  logEvent('info', 'cli:proxy_starting');
  await proxy.start();
  logEvent('info', 'cli:proxy_started');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  logError('main-fatal', error);
  process.exit(1);
});
