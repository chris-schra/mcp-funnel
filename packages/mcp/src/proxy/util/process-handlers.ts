import type { ChildProcess } from 'child_process';
import { logger, prefixedLog } from '../logging.js';

/**
 * Configuration for setting up process error and exit handlers.
 * @public
 */
export interface ProcessHandlerConfig {
  /** Server identifier for logging */
  serverName: string;
  /** Child process to attach handlers to */
  process: ChildProcess;
  /** Callback invoked on process error events */
  onError: (error: Error) => void;
  /** Callback invoked when process closes (any exit code) */
  onClose: () => void;
}

/**
 * Sets up error and close handlers for a child process.
 * Attaches 'error' and 'close' event listeners to the process. Non-zero exit codes
 * are logged as errors with code and signal information. Extracted as pure function
 * for testability and reuse across transport implementations.
 * @param {ProcessHandlerConfig} config - Process handler configuration
 * @public
 * @see file:../transports/base-transport.ts:123 - Usage in base transport
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
