import { resolve } from 'path';
import { existsSync } from 'fs';
import { MCPProxy, getUserBasePath, resolveMergedProxyConfig } from '../index.js';
import { DaemonServer, DEFAULT_SOCKET_PATH, DEFAULT_PID_FILE, DEFAULT_LOG_FILE } from '../daemon/index.js';
import { logError, logEvent } from '@mcp-funnel/core';
import { normalizeServers } from '../utils/normalizeServers.js';

/**
 * Starts the mcp-funnel daemon process.
 * Initializes the proxy once and listens for client connections on a Unix domain socket.
 */
export async function runDaemon(configPathArg?: string): Promise<void> {
  const configPath = configPathArg ?? '.mcp-funnel.json';
  const resolvedPath = resolve(process.cwd(), configPath);

  const projectExists = existsSync(resolvedPath);
  const userBasePath = getUserBasePath();
  const userBaseExists = existsSync(userBasePath);

  if (!projectExists && !userBaseExists) {
    console.error('No configuration file found.');
    console.error(`  Checked: ${resolvedPath}`);
    console.error(`  Checked: ${userBasePath}`);
    process.exit(1);
  }

  let config;
  let actualConfigPath: string;
  try {
    const merged = resolveMergedProxyConfig(resolvedPath);
    config = merged.config;
    actualConfigPath = merged.paths.projectConfigPath;
  } catch (error) {
    console.error('Failed to load configuration:', error);
    logError('daemon:config-load', error, { path: resolvedPath });
    process.exit(1);
  }

  const normalizedServers = normalizeServers(config.servers);
  logEvent('info', 'daemon:config_loaded', {
    path: actualConfigPath,
    servers: normalizedServers.map((s) => ({ name: s.name, cmd: s.command })),
  });

  const proxy = new MCPProxy(config, actualConfigPath);
  const daemon = new DaemonServer(proxy, {
    socketPath: DEFAULT_SOCKET_PATH,
    pidFile: DEFAULT_PID_FILE,
    logFile: DEFAULT_LOG_FILE,
    configPath: actualConfigPath,
  });

  // Graceful shutdown on signals
  const shutdown = async (signal: string) => {
    logEvent('info', 'daemon:signal', { signal });
    await daemon.stop();
    process.exit(0);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  try {
    await daemon.start();
  } catch (error) {
    console.error('Failed to start daemon:', error);
    logError('daemon:start-failed', error);
    process.exit(1);
  }
}
