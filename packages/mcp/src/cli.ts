import { Command } from 'commander';
import { MCPProxy, getUserBasePath, resolveMergedProxyConfig } from './index.js';
import { mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { logError, logEvent } from '@mcp-funnel/core';
import { normalizeServers } from './utils/normalizeServers.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

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

/**
 * Displays usage information and example configuration, then exits.
 */
function displayUsageAndExit(): never {
  console.error('\nUsage:');
  console.error(
    '  npx mcp-funnel                    # Uses .mcp-funnel.json from current directory',
  );
  console.error('  npx mcp-funnel path/to/config.json # Uses specified config file');
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

/**
 * Result of loading and merging proxy configuration.
 */
interface LoadedConfiguration {
  config: ProxyConfig;
  actualConfigPath: string;
}

/**
 * Loads and merges proxy configuration from project and user paths.
 * @param configPath - Path to the project configuration file
 * @returns Loaded configuration and actual config path
 */
function loadConfiguration(configPath: string): LoadedConfiguration {
  try {
    const merged = resolveMergedProxyConfig(configPath);
    return {
      config: merged.config,
      actualConfigPath: merged.paths.projectConfigPath,
    };
  } catch (error) {
    console.error('Failed to load configuration:', error);
    logError('config-load', error, { path: configPath });
    process.exit(1);
  }
}

const program = new Command();

program
  .name('mcp-funnel')
  .description('MCP Funnel CLI that proxies and manages multiple MCP servers')
  .showHelpAfterError();

program.enablePositionalOptions(true);

program
  .command('run <commandName> [commandArgs...]')
  .description('Run a CLI command from the MCP Funnel command suite')
  .allowUnknownOption(true)
  .passThroughOptions()
  .action(async (commandName: string, commandArgs: string[] = []) => {
    const { runCommand } = await import('./commands/run.js');
    await runCommand(commandName, commandArgs);
  });

program
  .command('init')
  .description('Interactive onboarding to migrate existing MCP configs into MCP Funnel')
  .action(async () => {
    const { runInit } = await import('./commands/init.js');
    await runInit();
  });

program
  .argument('[configPath]', 'Path to MCP Funnel configuration file', '.mcp-funnel.json')
  .action(async (configPathArg: string) => {
    await startProxy(configPathArg);
  });

/**
 * Starts the MCP proxy server with the specified configuration.
 * @param configPathArg - Path to the MCP Funnel configuration file
 */
async function startProxy(configPathArg: string): Promise<void> {
  const configPath = configPathArg ?? '.mcp-funnel.json';
  const resolvedPath = resolve(process.cwd(), configPath);

  proxyInstance = undefined;

  const projectExists = existsSync(resolvedPath);
  const userBasePath = getUserBasePath();
  const userBaseExists = existsSync(userBasePath);

  if (!projectExists && !userBaseExists) {
    displayUsageAndExit();
  }

  const { config, actualConfigPath } = loadConfiguration(resolvedPath);

  const normalizedServers = normalizeServers(config.servers);
  logEvent('info', 'cli:config_loaded', {
    path: actualConfigPath,
    servers: normalizedServers.map((s) => ({
      name: s.name,
      cmd: s.command,
    })),
  });

  const proxy = new MCPProxy(config, actualConfigPath);
  proxyInstance = proxy;

  logEvent('info', 'cli:proxy_starting');
  await proxy.start();
  logEvent('info', 'cli:proxy_started');
}

// Setup shutdown handlers
let isShuttingDown = false;
let proxyInstance: MCPProxy | undefined;
/**
 * Handles graceful shutdown of the MCP proxy server.
 *
 * Ensures the server shuts down cleanly when receiving termination signals.
 * Prevents duplicate shutdown attempts and logs the shutdown event.
 * @param signal - The OS signal that triggered the shutdown (e.g., 'SIGINT', 'SIGTERM')
 * @param proxy - Optional MCPProxy instance to shut down; if provided, calls proxy.shutdown() before exiting
 */
async function handleShutdown(signal: string, proxy?: MCPProxy) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logEvent('info', `cli:shutdown`, { signal, exit_code: 0 });

  if (proxy) {
    await proxy.shutdown();
  }

  process.exit(0);
}

/**
 * Initializes the CLI application and parses command-line arguments.
 */
async function bootstrap(): Promise<void> {
  if (!process.env.MCP_FUNNEL_RUN_ID) {
    process.env.MCP_FUNNEL_RUN_ID = `${Date.now()}-${process.pid}`;
  }

  logEvent('info', 'cli:start', { argv: process.argv, cwd: process.cwd() });

  await program.parseAsync(process.argv);
}

// Register signal handlers at module level to prevent memory leaks
process.once('SIGINT', () => handleShutdown('SIGINT', proxyInstance));
process.once('SIGTERM', () => handleShutdown('SIGTERM', proxyInstance));

bootstrap().catch((error) => {
  console.error('Fatal error:', error);
  logError('main-fatal', error);
  process.exit(1);
});
