/**
 * Maps CDP pause reasons to standardized DebugState pause reasons.
 *
 * CDP sends different pause reasons depending on the runtime (Node vs Chrome)
 * and these don't always match the official devtools-protocol types.
 *
 * Real-world reasons we've observed:
 * - "Break on start" - Node.js with --inspect-brk (not in official spec!)
 * - "debugCommand" - debugger statement in Chrome
 * - "other" - various other pause reasons
 * - "exception" - uncaught exception
 * - "step" - step over/into/out
 * - "breakpoint" - user breakpoint hit
 */

import type { DebugState } from '../types/index.js';

/**
 * Normalizes CDP-specific pause reasons to standardized DebugState pause reasons.
 *
 * CDP implementations send different pause reason strings depending on the runtime
 * environment (Node.js vs Browser) and these don't always match the official
 * devtools-protocol specification. This function provides defensive handling by
 * mapping known CDP reasons to our internal types and gracefully handling unknown
 * reasons with a warning.
 * @param cdpReason - Raw pause reason string from CDP Debugger.paused event
 * @returns Normalized pause reason, or 'debugger' for unknown reasons
 * @example
 * ```typescript
 * // Node.js with --inspect-brk
 * mapCDPPauseReason('Break on start'); // returns 'entry'
 *
 * // Standard breakpoint
 * mapCDPPauseReason('breakpoint'); // returns 'breakpoint'
 *
 * // Unknown reason handled gracefully
 * mapCDPPauseReason('unknownReason'); // logs warning, returns 'debugger'
 * ```
 * @see file:../types/debug-state.ts:14 - DebugState pauseReason type definition
 * @see file:../adapters/node/pause-handler.ts:150 - Primary usage in pause handling
 * @public
 */
export function mapCDPPauseReason(
  cdpReason: string,
): DebugState['pauseReason'] {
  // Log the actual reason we received for debugging
  console.debug('[PauseReasonMapper] Received CDP pause reason:', cdpReason);

  // Map known CDP reasons to our standardized reasons
  switch (cdpReason) {
    // Node.js specific
    case 'Break on start':
      return 'entry';

    // Standard CDP reasons
    case 'breakpoint':
      return 'breakpoint';

    case 'step':
      return 'step';

    case 'exception':
    case 'promiseRejection':
    case 'assert':
    case 'OOM':
      return 'exception';

    // debugger statement and similar
    case 'debugCommand':
    case 'other':
    case 'instrumentation':
      return 'debugger';

    // Browser-specific reasons we treat as debugger pauses
    case 'DOM':
    case 'EventListener':
    case 'XHR':
    case 'CSPViolation':
      return 'debugger';

    // Unknown reason - log a warning but don't crash
    default:
      console.warn(
        `[PauseReasonMapper] Unknown CDP pause reason: "${cdpReason}", treating as 'debugger'`,
      );
      return 'debugger';
  }
}

/**
 * Returns comprehensive list of known CDP pause reasons across all runtimes.
 *
 * Useful for testing to verify that the mapper handles all documented CDP reasons.
 * Includes both official CDP spec reasons and runtime-specific reasons observed
 * in the wild (e.g., Node.js's "Break on start").
 * @returns Array of all known CDP pause reason strings
 * @example
 * ```typescript
 * const reasons = getAllKnownCDPReasons();
 * reasons.forEach(reason => {
 *   const mapped = mapCDPPauseReason(reason);
 *   console.log(`${reason} -> ${mapped}`);
 * });
 * ```
 * @public
 */
export function getAllKnownCDPReasons(): string[] {
  return [
    // Node.js specific (not in spec)
    'Break on start',

    // Official CDP spec reasons
    'ambiguous',
    'assert',
    'CSPViolation',
    'debugCommand',
    'DOM',
    'EventListener',
    'exception',
    'instrumentation',
    'OOM',
    'other',
    'promiseRejection',
    'XHR',
    'step',
    'breakpoint',
  ];
}
