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
 * Test helper to verify all known reasons are handled
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
