import { MCPProxy } from '../index.js';
import { DaemonServer, DEFAULT_SOCKET_PATH, DEFAULT_PID_FILE, DEFAULT_LOG_FILE, DEFAULT_CONFIG_FILENAME } from '../daemon/index.js';
import { logEvent } from '@mcp-funnel/core';
import { resolveConfigPath, checkConfigExists, loadConfiguration } from '../utils/load-configuration.js';

/**
 * Starts the mcp-funnel daemon process.
 * Initializes the proxy once and listens for client connections on a Unix domain socket.
 */
export async function runDaemon(configPathArg?: string): Promise<void> {
  const configPath = configPathArg ?? DEFAULT_CONFIG_FILENAME;
  const resolvedPath = resolveConfigPath(configPath);

  const { projectExists, userBaseExists, userBasePath } = checkConfigExists(resolvedPath);

  if (!projectExists && !userBaseExists) {
    console.error('No configuration file found.');
    console.error(`  Checked: ${resolvedPath}`);
    console.error(`  Checked: ${userBasePath}`);
    process.exit(1);
  }

  let config;
  let actualConfigPath: string;
  try {
    ({ config, actualConfigPath } = loadConfiguration(resolvedPath));
  } catch (error) {
    console.error('Failed to load configuration:', error);
    logEvent('error', 'daemon:config-load', { path: resolvedPath, error: String(error) });
    process.exit(1);
  }

  logEvent('info', 'daemon:config_loaded', { path: actualConfigPath });

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
    logEvent('error', 'daemon:start-failed', { error: String(error) });
    process.exit(1);
  }
}
