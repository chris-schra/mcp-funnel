import { ReconnectionManager } from '@mcp-funnel/core';
import { prefixedLog, logger } from '../logging.js';

/**
 * Configuration for reconnection scheduling
 */
export interface ReconnectionSchedulerConfig {
  serverName: string;
  maxAttempts: number;
  reconnectionManager: ReconnectionManager;
}

/**
 * Schedules and manages reconnection attempts with backoff
 * Extracted to reduce complexity in transport classes
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
      const failMsg = prefixedLog(
        config.serverName,
        `Reconnection failed: ${error}`,
      );
      console.error(failMsg);

      if (error.message.includes('Max reconnection attempts')) {
        const giveUpMsg = prefixedLog(
          config.serverName,
          'Giving up after maximum retry attempts',
        );
        console.error(giveUpMsg);
        logger.error('reconnection-failed-max-retries', error, {
          server: config.serverName,
        });
      }

      // Re-throw to let caller handle if needed
      throw error;
    });
}
