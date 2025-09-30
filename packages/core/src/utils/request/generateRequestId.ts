import { randomBytes } from 'crypto';

/**
 * Generates a unique request ID with embedded timestamp.
 *
 * Creates IDs with format: `[prefix_]timestamp_randomhex`
 * The timestamp allows for time-based tracking and the random suffix prevents collisions.
 * @param prefix - Optional prefix to namespace the request ID
 * @returns Unique request ID string
 * @public
 */
export function generateRequestId(prefix?: string): string {
  const timestamp = Date.now();
  const randomSuffix = randomBytes(4).toString('hex');
  return `${prefix ? `${prefix}_` : ''}${timestamp}_${randomSuffix}`;
}
