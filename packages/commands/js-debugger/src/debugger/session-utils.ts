import { setTimeout as delay } from 'node:timers/promises';

import type { PauseDetails, SessionState } from '../types/index.js';
import type { SessionEvents } from './session-types.js';
import { buildConsoleEntry } from './session-mappers.js';
import type { OutputBuffer } from './output-buffer.js';
import type Emittery from 'emittery';

export const COMMAND_TIMEOUT_MS = 10_000;
export const GRACEFUL_EXIT_DELAY_MS = 100;
export const BREAKPOINT_CLEAR_DELAY_MS = 1_000;

/**
 * Wraps a promise with a timeout, rejecting if not resolved within the specified time.
 * @param promise - The promise to wrap with timeout
 * @param timeoutMs - Timeout duration in milliseconds
 * @param message - Error message to throw on timeout
 * @returns The resolved promise value
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  const timeout = (async () => {
    await delay(timeoutMs);
    throw new Error(message);
  })();
  return Promise.race([promise, timeout]) as Promise<T>;
}

/**
 * Waits for a pause event, optionally using the existing pause if available.
 * @param events - Event emitter to listen for pause events
 * @param lastPause - Last recorded pause details
 * @param reason - Descriptive reason for the pause wait
 * @param useExisting - Whether to return existing pause if available
 * @returns Pause details when event fires or existing pause
 */
export async function waitForPause(
  events: Emittery<SessionEvents>,
  lastPause: PauseDetails | undefined,
  reason: string,
  useExisting = false,
): Promise<PauseDetails> {
  if (useExisting && lastPause) {
    return lastPause;
  }
  return withTimeout(
    events.once('paused'),
    COMMAND_TIMEOUT_MS,
    `Timed out waiting for pause (${reason})`,
  );
}

/**
 * Waits for a resumed event if not already running.
 * @param events - Event emitter to listen for resume events
 * @param status - Current session state
 * @param reason - Descriptive reason for the resume wait
 * @returns Promise that resolves when resumed or immediately if already running
 */
export async function waitForResumed(
  events: Emittery<SessionEvents>,
  status: SessionState,
  reason: string,
): Promise<void> {
  if (status.status === 'running' || status.status === 'awaiting-debugger') {
    return;
  }
  await withTimeout(
    events.once('resumed'),
    COMMAND_TIMEOUT_MS,
    `Timed out waiting for resume (${reason})`,
  );
}

/**
 * Creates an instruction console entry and adds it to the output buffer.
 * @param outputBuffer - Output buffer to add instruction entry to
 * @param text - Instruction text to display
 * @returns void
 */
export function emitInstructions(
  outputBuffer: OutputBuffer,
  text: string,
): void {
  const entry = buildConsoleEntry(
    'info',
    'log-entry',
    [],
    Date.now(),
    undefined,
  );
  entry.text = text;
  outputBuffer.addConsole(entry);
}

/**
 * Attempts to run the debugger if it's waiting, suppressing expected errors.
 * @param sendCommand - Function to send CDP commands
 * @returns Promise that resolves when debugger runs or expected error is suppressed
 */
export async function tryRunIfWaitingForDebugger(
  sendCommand: <T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ) => Promise<T>,
): Promise<void> {
  try {
    await sendCommand('Runtime.runIfWaitingForDebugger');
  } catch (error) {
    if (
      error instanceof Error &&
      !/not waiting|cannot be run|No process is waiting/i.test(error.message)
    ) {
      throw error;
    }
  }
}
