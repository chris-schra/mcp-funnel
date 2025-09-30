import { logError, logEvent, ReconnectionManager } from '@mcp-funnel/core';
import type { ProxyConfig, TargetServer } from '@mcp-funnel/schemas';
import type { ReconnectionConfig } from '@mcp-funnel/models';
import type { EventEmitter } from 'events';

/**
 * Configuration for creating a ReconnectionManager.
 * @public
 */
export interface ReconnectionManagerConfig {
  /** Proxy configuration containing autoReconnect settings */
  config: ProxyConfig;
  /** Server identifier */
  serverName: string;
  /** Callback invoked when max reconnection attempts are reached */
  onMaxAttemptsReached: (serverName: string) => void;
}

/**
 * Creates a ReconnectionManager for a server with configured retry behavior.
 * Extracts reconnection config from proxy autoReconnect settings and creates a manager
 * with default values:
 * - maxAttempts: 10
 * - initialDelayMs: 1000ms
 * - backoffMultiplier: 2
 * - maxDelayMs: 60000ms
 * - jitter: 0.25
 * Sets up state change listener to invoke callback when max attempts are reached.
 * @param managerConfig - Manager configuration
 * @returns Configured ReconnectionManager instance
 * @public
 * @see file:./server-connection-manager.ts:95 - Usage in server connection manager
 */
export function createReconnectionManager(
  managerConfig: ReconnectionManagerConfig,
): ReconnectionManager {
  const { config, serverName, onMaxAttemptsReached } = managerConfig;

  const autoReconnectConfig = config.autoReconnect;
  const reconnectionConfig: ReconnectionConfig = {
    maxAttempts: autoReconnectConfig?.maxAttempts ?? 10,
    initialDelayMs: autoReconnectConfig?.initialDelayMs ?? 1000,
    backoffMultiplier: autoReconnectConfig?.backoffMultiplier ?? 2,
    maxDelayMs: autoReconnectConfig?.maxDelayMs ?? 60000,
    jitter: autoReconnectConfig?.jitter ?? 0.25,
  };

  const reconnectionManager = new ReconnectionManager(reconnectionConfig);

  // Set up state change handler for max attempts
  reconnectionManager.onStateChange((event) => {
    if (event.to === 'failed') {
      console.error(
        `[proxy] Max reconnection attempts reached for ${serverName}`,
      );
      logEvent('error', 'server:max_reconnection_attempts', {
        name: serverName,
      });
      onMaxAttemptsReached(serverName);
    }
  });

  return reconnectionManager;
}

/**
 * Configuration for a reconnection attempt.
 * @public
 */
export interface ReconnectionAttemptConfig {
  /** Server to reconnect to */
  targetServer: TargetServer;
  /** Reconnection manager for attempt tracking (optional) */
  reconnectionManager: ReconnectionManager | undefined;
  /** Event emitter for reconnection status events */
  eventEmitter: EventEmitter;
  /** Function to perform the actual connection */
  connectFn: (targetServer: TargetServer) => Promise<void>;
  /** Callback invoked on successful reconnection */
  onSuccess: (serverName: string) => void;
  /** Callback invoked on reconnection failure */
  onFailure: (serverName: string, error: unknown) => void;
}

/**
 * Attempts to reconnect to a disconnected server with retry tracking.
 * Orchestrates a reconnection attempt:
 * 1. Emits 'server.reconnecting' event with retry attempt count
 * 2. Calls the connection function
 * 3. On success: resets reconnection manager and emits success events
 * 4. On failure: logs error and invokes failure callback
 * Used by ReconnectionManager's automatic reconnection logic.
 * @param attemptConfig - Reconnection attempt configuration
 * @public
 * @see file:./server-connection-manager.ts:201 - Usage in connection manager
 */
export async function attemptReconnection(
  attemptConfig: ReconnectionAttemptConfig,
): Promise<void> {
  const {
    targetServer,
    reconnectionManager,
    eventEmitter,
    connectFn,
    onSuccess,
    onFailure,
  } = attemptConfig;

  const serverName = targetServer.name;
  const retryAttempt = reconnectionManager?.getAttemptCount() || 0;

  // Emit server reconnecting event for automatic reconnection
  eventEmitter.emit('server.reconnecting', {
    serverName,
    status: 'reconnecting',
    timestamp: new Date().toISOString(),
    retryAttempt,
  });

  try {
    await connectFn(targetServer);

    // Reset the reconnection manager on successful connection
    if (reconnectionManager) {
      reconnectionManager.reset();
    }

    console.error(`[proxy] Auto-reconnected to: ${serverName}`);
    logEvent('info', 'server:auto_reconnected', { name: serverName });

    onSuccess(serverName);
  } catch (error) {
    console.error(`[proxy] Auto-reconnection failed for ${serverName}:`, error);
    logError('server:auto_reconnect_failed', error, { name: serverName });

    onFailure(serverName, error);
  }
}

/**
 * Determines whether automatic reconnection should be enabled.
 * Returns true only if:
 * - autoReconnect.enabled is not explicitly false in config
 * - AND disconnect was not manually requested by user
 * @param config - Proxy configuration
 * @param isManualDisconnect - Whether disconnect was manually triggered
 * @returns True if automatic reconnection should be attempted
 * @public
 * @see file:./server-connection-manager.ts:197 - Usage in disconnect handler
 */
export function shouldAutoReconnect(
  config: ProxyConfig,
  isManualDisconnect: boolean,
): boolean {
  const autoReconnectConfig = config.autoReconnect;
  const isAutoReconnectEnabled = autoReconnectConfig?.enabled !== false;

  return isAutoReconnectEnabled && !isManualDisconnect;
}
