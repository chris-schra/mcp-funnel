import * as readline from 'readline';
import type { StreamHandlerConfig } from '../types.js';

/**
 * Creates a readline interface for handling line-by-line stream output
 * Pure function that can be extracted and reused
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
