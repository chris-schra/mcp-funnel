import type { CDPClient } from '../../cdp/index.js';
import type { DebugState } from '../../types/index.js';
import type { PageManager } from './page-manager.js';
import type { BreakpointManager } from './breakpoint-manager.js';
import type { ScriptInfo } from './handlers/script-handler.js';

/**
 * Promise info tracked during waitForPause operations.
 * @internal
 */
export type PausePromiseInfo = {
  resolve: (state: DebugState) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
};

/**
 * Enables required CDP domains for debugging.
 *
 * Activates Runtime, Debugger, Console, and Page domains, then configures
 * the debugger to pause on uncaught exceptions.
 * @param cdpClient - CDP client instance
 * @internal
 */
export async function enableCDPDomains(cdpClient: CDPClient): Promise<void> {
  await Promise.all([
    cdpClient.send('Runtime.enable'),
    cdpClient.send('Debugger.enable'),
    cdpClient.send('Console.enable'),
    cdpClient.send('Page.enable'),
  ]);

  await cdpClient.send('Debugger.setPauseOnExceptions', {
    state: 'uncaught',
  });
}

/**
 * Disables CDP domains during cleanup.
 *
 * Attempts to disable all previously enabled domains. Suppresses errors
 * to ensure cleanup completes even if connection is already closed.
 * @param cdpClient - CDP client instance
 * @internal
 */
export async function disableCDPDomains(cdpClient: CDPClient): Promise<void> {
  try {
    await Promise.all([
      cdpClient.send('Debugger.disable'),
      cdpClient.send('Runtime.disable'),
      cdpClient.send('Console.disable'),
      cdpClient.send('Page.disable'),
    ]);
  } catch (_error) {
    // Ignore errors during cleanup
  }
}

/**
 * Rejects all pending waitForPause promises during disconnect.
 *
 * Clears timeouts and rejects promises with termination error to prevent
 * callers from hanging when debug session ends.
 * @param pausePromises - Set of pending pause promise info
 * @internal
 */
export function rejectPendingPausePromises(
  pausePromises: Set<PausePromiseInfo>,
): void {
  const terminationError = new Error('Debug session terminated');
  Array.from(pausePromises).forEach((promise) => {
    if (promise.timeout) clearTimeout(promise.timeout);
    promise.reject(terminationError);
  });
  pausePromises.clear();
}

/**
 * Resets adapter state after disconnection.
 *
 * Clears scripts, breakpoints, call frames, and resets connection flags.
 * Prepares adapter for potential reconnection.
 * @param pageManager - Page manager to clear target
 * @param scripts - Script info map to clear
 * @param breakpointManager - Breakpoint manager to clear
 * @param state - Container for current call frames and debug state (mutated)
 * @internal
 */
export function resetAdapterState(
  pageManager: PageManager,
  scripts: Map<string, ScriptInfo>,
  breakpointManager: BreakpointManager,
  state: {
    currentCallFrames: unknown[];
    debugState: DebugState;
  },
): void {
  pageManager.clearTarget();
  scripts.clear();
  breakpointManager.clearBreakpoints();
  state.currentCallFrames = [];
  state.debugState = { status: 'terminated' };
}

/**
 * Throws error if not connected to a debugging target.
 *
 * Use as guard at start of methods requiring active connection.
 * @param isConnected - Connection status flag
 * @throws \{Error\} When not connected to debugging target
 * @internal
 */
export function ensureConnected(isConnected: boolean): void {
  if (!isConnected) {
    throw new Error('Not connected to debugging target');
  }
}

/**
 * Creates a promise that resolves when debugger pauses or rejects on timeout.
 *
 * Registers promise info in the pause promises set for notification by event handlers.
 * Resolves immediately if already paused.
 * @param debugState - Current debug state
 * @param pausePromises - Set to track pending pause promises
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @returns Promise resolving to debug state when paused
 * @throws \{Error\} When timeout expires before pause occurs
 * @internal
 */
export function createWaitForPausePromise(
  debugState: DebugState,
  pausePromises: Set<PausePromiseInfo>,
  timeoutMs: number,
): Promise<DebugState> {
  if (debugState.status === 'paused') {
    return Promise.resolve(debugState);
  }

  return new Promise<DebugState>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pausePromises.delete(promiseInfo);
      reject(new Error(`waitForPause timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    const promiseInfo: PausePromiseInfo = { resolve, reject, timeout };
    pausePromises.add(promiseInfo);
  });
}
