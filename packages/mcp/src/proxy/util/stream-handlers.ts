import * as readline from 'readline';
import type { StreamHandlerConfig } from '../types.js';

/**
 * Creates a readline interface for handling line-by-line stream output.
 *
 * Sets up a readline interface that reads from a stream and invokes the
 * onLine callback for each non-empty line. Useful for processing stdout/stderr.
 * @param config - Configuration with stream and line handler callback
 * @public
 */
export function createStreamHandler(config: StreamHandlerConfig): void {
  const rl = readline.createInterface({
    input: config.stream,
    crlfDelay: Infinity,
  });

  rl.on('line', (line: string) => {
    if (line.trim()) {
      config.onLine(line);
    }
  });
}

// Re-export the type for convenience
export type { StreamHandlerConfig } from '../types.js';
