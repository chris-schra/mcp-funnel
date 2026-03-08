import { join } from 'path';
import { homedir } from 'os';

/** Default path for the Unix domain socket */
export const DEFAULT_SOCKET_PATH = join(homedir(), '.mcp-funnel.sock');

/** Default path for the daemon PID file */
export const DEFAULT_PID_FILE = join(homedir(), '.mcp-funnel.pid');

/** Default path for the daemon log file */
export const DEFAULT_LOG_FILE = join(homedir(), '.mcp-funnel-daemon.log');

/** Maximum time (ms) to wait for daemon to become ready during auto-start */
export const DAEMON_STARTUP_TIMEOUT_MS = 30_000;

/** Interval (ms) to poll for daemon readiness during auto-start */
export const DAEMON_POLL_INTERVAL_MS = 200;

/** Default configuration filename */
export const DEFAULT_CONFIG_FILENAME = '.mcp-funnel.json';

/** Configuration for the daemon server */
export interface DaemonConfig {
  socketPath: string;
  pidFile: string;
  logFile: string;
  configPath: string;
}

/** Information about a connected client session */
export interface DaemonSession {
  id: string;
  connectedAt: string;
}
