import { logError, logEvent, ReconnectionManager } from '@mcp-funnel/core';
import type { ProxyConfig, TargetServer } from '@mcp-funnel/schemas';
import type { ReconnectionConfig } from '@mcp-funnel/models';
import type { EventEmitter } from 'events';

/**
 * Configuration for creating a ReconnectionManager
 */
export interface ReconnectionManagerConfig {
  config: ProxyConfig;
  serverName: string;
  onMaxAttemptsReached: (serverName: string) => void;
}

/**
 * Create a ReconnectionManager for a server
 * Sets up state change handler for max attempts
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
 * Configuration for reconnection attempt
 */
export interface ReconnectionAttemptConfig {
  targetServer: TargetServer;
  reconnectionManager: ReconnectionManager | undefined;
  eventEmitter: EventEmitter;
  connectFn: (targetServer: TargetServer) => Promise<void>;
  onSuccess: (serverName: string) => void;
  onFailure: (serverName: string, error: unknown) => void;
}

/**
 * Attempt to reconnect to a disconnected server
 * Used by ReconnectionManager for automatic reconnection
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
 * Check if automatic reconnection should be enabled
 */
export function shouldAutoReconnect(
  config: ProxyConfig,
  isManualDisconnect: boolean,
): boolean {
  const autoReconnectConfig = config.autoReconnect;
  const isAutoReconnectEnabled = autoReconnectConfig?.enabled !== false;

  return isAutoReconnectEnabled && !isManualDisconnect;
}
