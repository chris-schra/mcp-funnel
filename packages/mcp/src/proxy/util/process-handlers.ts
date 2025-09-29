import type { ChildProcess } from 'child_process';
import { logger, prefixedLog } from '../logging.js';

/**
 * Configuration for setting up process error and exit handlers
 */
export interface ProcessHandlerConfig {
  serverName: string;
  process: ChildProcess;
  onError: (error: Error) => void;
  onClose: () => void;
}

/**
 * Sets up error and close handlers for a child process
 * Extracted pure function for better testability and reuse
 */
export function setupProcessHandlers(config: ProcessHandlerConfig): void {
  config.process.on('error', (error) => {
    const errorMsg = prefixedLog(config.serverName, `Process error: ${error}`);
    logger.error(errorMsg, error, {
      server: config.serverName,
      context: 'process-error',
    });
    config.onError(error);
  });

  config.process.on('close', (code, signal) => {
    if (code !== 0) {
      const errorMsg = `Process exited with code ${code}, signal ${signal}`;
      const prefixedMsg = prefixedLog(config.serverName, errorMsg);
      logger.error(
        prefixedMsg,
        { message: errorMsg, code, signal },
        {
          server: config.serverName,
          context: 'process-exit',
          code,
          signal,
        },
      );
    }
    config.onClose();
  });
}
