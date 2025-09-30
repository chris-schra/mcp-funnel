/**
 * Helper utilities for OAuth request processing and data conversion.
 *
 * Provides static methods for common OAuth operations including boolean flag parsing,
 * user ID extraction, response format detection, and type coercion.
 * @example
 * ```typescript
 * import { HelperUtils } from './helper.utils.js';
 *
 * // Parse boolean flag from form data
 * const enabled = HelperUtils.parseBooleanFlag('true');
 *
 * // Get current user ID from request context
 * const userId = HelperUtils.getCurrentUserId(c);
 *
 * // Check if client prefers JSON response
 * if (HelperUtils.prefersJsonResponse(c)) {
 *   return jsonResponse;
 * }
 * ```
 * @public
 * @see {@link parseBooleanFlag}
 * @see {@link getCurrentUserId}
 * @see {@link prefersJsonResponse}
 */

import { parseBooleanFlag } from './parse-boolean-flag.js';
import { getCurrentUserId } from './get-current-user-id.js';
import { prefersJsonResponse } from './prefers-json-response.js';
import { coerceToString } from '../../provider/utils/coerceToString.js';
import { coerceToNumber } from '../../provider/utils/coerceToNumber.js';

export class HelperUtils {
  public static parseBooleanFlag = parseBooleanFlag;
  public static getCurrentUserId = getCurrentUserId;
  public static prefersJsonResponse = prefersJsonResponse;
  public static coerceToString = coerceToString;
  public static coerceToNumber = coerceToNumber;
}

// Re-export individual functions for direct import
export { parseBooleanFlag } from './parse-boolean-flag.js';
export { getCurrentUserId } from './get-current-user-id.js';
export { prefersJsonResponse } from './prefers-json-response.js';
export { coerceToString } from '../../provider/utils/coerceToString.js';
export { coerceToNumber } from '../../provider/utils/coerceToNumber.js';
