import { ReconnectionManager } from '@mcp-funnel/core';
import { prefixedLog, logger } from '../logging.js';

/**
 * Configuration for reconnection scheduling with backoff support.
 * @public
 */
export interface ReconnectionSchedulerConfig {
  /** Server name for logging and identification */
  serverName: string;
  /** Maximum reconnection attempts before giving up */
  maxAttempts: number;
  /** ReconnectionManager instance that handles backoff strategy */
  reconnectionManager: ReconnectionManager;
}

/**
 * Schedules and manages reconnection attempts with exponential backoff.
 *
 * Delegates to ReconnectionManager for backoff scheduling while handling
 * logging and error propagation. Re-throws errors after max attempts reached.
 * @param config - Reconnection configuration including manager and limits
 * @param reconnectFn - Async function to execute reconnection logic
 * @returns Promise that resolves on success or rejects on failure
 * @throws Error when max reconnection attempts exceeded
 * @public
 * @see file:./reconnection-handler.ts - ReconnectionManager creation
 */
export function scheduleReconnection(
  config: ReconnectionSchedulerConfig,
  reconnectFn: () => Promise<void>,
): Promise<void> {
  return config.reconnectionManager
    .scheduleReconnect(async () => {
      const attemptMsg = prefixedLog(
        config.serverName,
        `Attempting reconnection (${config.reconnectionManager.currentRetryCount}/${config.maxAttempts})`,
      );
      console.error(attemptMsg);

      await reconnectFn();

      console.error(prefixedLog(config.serverName, 'Reconnection successful'));
    })
    .catch((error) => {
      const failMsg = prefixedLog(config.serverName, `Reconnection failed: ${error}`);
      console.error(failMsg);

      if (error.message.includes('Max reconnection attempts')) {
        const giveUpMsg = prefixedLog(config.serverName, 'Giving up after maximum retry attempts');
        console.error(giveUpMsg);
        logger.error('reconnection-failed-max-retries', error, {
          server: config.serverName,
        });
      }

      // Re-throw to let caller handle if needed
      throw error;
    });
}
