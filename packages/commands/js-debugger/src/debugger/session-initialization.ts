import { setTimeout as delay } from 'node:timers/promises';

import type {
  BreakpointSpec,
  BreakpointSummary,
  DebugSessionConfig,
  NodeDebugTargetConfig,
  PauseDetails,
} from '../types/index.js';
import type { SessionBreakpointManager } from './session-breakpoint-manager.js';
import type { SessionProcessManager } from './session-process-manager.js';
import type { OutputBuffer } from './output-buffer.js';
import {
  waitForPause,
  tryRunIfWaitingForDebugger,
  emitInstructions,
  BREAKPOINT_CLEAR_DELAY_MS,
} from './session-utils.js';
import type Emittery from 'emittery';
import type { SessionEvents } from './session-types.js';
import { normalizeLocationReference } from './session-breakpoints.js';

export interface InitializationContext {
  sessionId: string;
  config: DebugSessionConfig;
  nodeTarget: NodeDebugTargetConfig;
  events: Emittery<SessionEvents>;
  processManager: SessionProcessManager;
  breakpointManager: SessionBreakpointManager;
  outputBuffer: OutputBuffer;
  getLastPause: () => PauseDetails | undefined;
}

export interface InitializationResult {
  breakpoints?: BreakpointSummary[];
  initialPause?: PauseDetails;
}

/**
 * Sets up internal breakpoints at line 0 for target files to ensure source maps are loaded.
 * Returns the list of internal breakpoint IDs that need to be cleaned up later.
 * @param targetFiles - Set of file paths/URLs to set breakpoints in
 * @param targetWorkingDirectory - Working directory for resolving relative paths
 * @param processManager - Process manager to send CDP commands
 * @param sessionId - Debug session identifier for logging
 * @returns Array of internal breakpoint IDs for cleanup
 */
async function setupInternalBreakpoints(
  targetFiles: Set<string>,
  targetWorkingDirectory: string,
  processManager: SessionProcessManager,
  sessionId: string,
): Promise<string[]> {
  const internalBreakpoints: string[] = [];

  for (const file of targetFiles) {
    try {
      // Normalize the file path to absolute path and file:// URL
      const normalized = normalizeLocationReference(file, targetWorkingDirectory);

      // Build regex that matches both the absolute path and file:// URL
      // CDP uses file:// URLs, so we need to match that format
      const patterns: string[] = [];
      if (normalized.fileUrl) {
        patterns.push(normalized.fileUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      }
      if (normalized.path) {
        patterns.push(normalized.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      }

      if (patterns.length === 0) {
        console.warn(`Session ${sessionId}: Could not normalize path for ${file}`);
        continue;
      }

      const urlRegex = patterns.join('|');

      let result;
      try {
        result = await processManager.sendCommand('Debugger.setBreakpointByUrl', {
          lineNumber: 0,
          columnNumber: 0,
          urlRegex,
          condition: '',
        });
      } catch (error) {
        console.error('Unable to set specific file regex breakpoint:', error);
        throw new Error('Unable to set specific file regex breakpoint');
      }
      const breakpointResult = result as {
        breakpointId: string;
        locations?: Array<{
          scriptId: string;
          lineNumber: number;
          columnNumber: number;
        }>;
      };
      internalBreakpoints.push(breakpointResult.breakpointId);
    } catch (error) {
      console.warn(`Session ${sessionId}: Failed to set internal breakpoint for ${file}:`, error);
    }
  }

  return internalBreakpoints;
}

/**
 * Clears internal breakpoints that were used for initialization.
 * @param breakpointIds - Array of breakpoint IDs to remove
 * @param processManager - Process manager to send CDP commands
 * @param sessionId - Debug session identifier for logging
 * @returns Promise that resolves when all breakpoints are cleared
 */
async function clearInternalBreakpoints(
  breakpointIds: string[],
  processManager: SessionProcessManager,
  sessionId: string,
): Promise<void> {
  for (const breakpointId of breakpointIds) {
    try {
      await processManager.sendCommand('Debugger.removeBreakpoint', {
        breakpointId,
      });
    } catch (error) {
      console.warn(
        `Session ${sessionId}: Failed to clear internal breakpoint ${breakpointId}:`,
        error,
      );
    }
  }
}

/**
 * Waits for breakpoints to be resolved by checking periodically.
 * @param createdBreakpoints - Array of breakpoints to check for resolution
 * @param breakpointManager - Breakpoint manager to query resolution status
 * @param maxAttempts - Maximum number of polling attempts
 * @returns True if any breakpoints were resolved, false otherwise
 */
async function waitForBreakpointResolution(
  createdBreakpoints: BreakpointSummary[],
  breakpointManager: SessionBreakpointManager,
  maxAttempts = 20,
): Promise<boolean> {
  let waitAttempts = 0;
  let hasResolvedBreakpoints = false;

  while (waitAttempts < maxAttempts && !hasResolvedBreakpoints) {
    await delay(100);
    waitAttempts++;

    // Re-fetch breakpoint status to see if they've been resolved
    for (const bp of createdBreakpoints) {
      const record = breakpointManager.getBreakpointRecord(bp.id);
      if (record && record.resolved && record.resolved.length > 0) {
        hasResolvedBreakpoints = true;
        // Update the createdBreakpoints array with resolved locations
        bp.resolvedLocations = record.resolved;
      }
    }
  }

  return hasResolvedBreakpoints;
}

/**
 * Collects target files from breakpoint specs and entry file.
 * Normalizes all paths to file:// URLs for consistent matching with CDP.
 * @param breakpoints - Optional array of breakpoint specifications
 * @param entryFile - Main entry file path (may be relative or absolute)
 * @param targetWorkingDirectory - Working directory for resolving relative paths
 * @returns Set of normalized file URLs to set internal breakpoints in
 */
function collectTargetFiles(
  breakpoints: BreakpointSpec[] | undefined,
  entryFile: string,
  targetWorkingDirectory: string,
): Set<string> {
  const targetFiles = new Set<string>();

  if (breakpoints && breakpoints.length > 0) {
    for (const bp of breakpoints) {
      if (bp.location.url) {
        // Normalize breakpoint URLs to ensure they match CDP's format
        const normalized = normalizeLocationReference(bp.location.url, targetWorkingDirectory);
        // Prefer file:// URL if available, fall back to path, then original
        const key = normalized.fileUrl || normalized.path || normalized.original;
        targetFiles.add(key);
      }
    }
  }

  // Always set a line 0 breakpoint for the main entry file to ensure script parsing
  // Normalize the entry file to an absolute path/URL
  const normalizedEntry = normalizeLocationReference(entryFile, targetWorkingDirectory);
  const entryKey = normalizedEntry.fileUrl || normalizedEntry.path || normalizedEntry.original;
  targetFiles.add(entryKey);

  return targetFiles;
}

/**
 * Handles the initial pause sequence: wait for --inspect-brk pause, then resume to hit internal breakpoints.
 * @param context - Initialization context
 * @returns Initial pause details, or undefined if pause did not occur
 */
async function handleInitialPauseSequence(
  context: InitializationContext,
): Promise<PauseDetails | undefined> {
  let initialPause: PauseDetails | undefined;
  try {
    initialPause = await waitForPause(
      context.events,
      context.getLastPause(),
      'Initial --inspect-brk pause',
      false,
    );

    // Resume to let the script execute and hit our internal line 0 breakpoints
    await context.processManager.sendCommand('Debugger.resume');
    // Now wait for the internal line 0 breakpoint to be hit (with hitBreakpoints)
    initialPause = await waitForPause(
      context.events,
      context.getLastPause(),
      'Internal line 0 breakpoint hit',
      false,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`Session ${context.sessionId}: did not receive initial pause (${message}).`);
  }
  return initialPause;
}

/**
 * Handles waiting for user breakpoint resolution and resuming to hit them.
 * @param createdBreakpoints - User breakpoints that were set
 * @param initialPause - The initial pause details
 * @param internalBreakpoints - Internal breakpoint IDs to clean up
 * @param context - Initialization context
 * @returns Actual pause details after hitting user breakpoint, or undefined
 */
async function handleUserBreakpointHit(
  createdBreakpoints: BreakpointSummary[],
  initialPause: PauseDetails,
  internalBreakpoints: string[],
  context: InitializationContext,
): Promise<PauseDetails | undefined> {
  // Wait for breakpoint resolution
  const hasResolvedBreakpoints = await waitForBreakpointResolution(
    createdBreakpoints,
    context.breakpointManager,
  );

  // Clear internal breakpoints since we don't need them anymore
  await clearInternalBreakpoints(internalBreakpoints, context.processManager, context.sessionId);

  if (!hasResolvedBreakpoints) {
    return initialPause;
  }

  // Resume from the internal breakpoint to hit the actual user breakpoint
  await context.processManager.sendCommand('Debugger.resume');

  // Wait for the actual user breakpoint to be hit
  try {
    return await waitForPause(context.events, context.getLastPause(), 'User breakpoint hit', false);
  } catch (error) {
    console.warn(
      `Session ${context.sessionId}: Failed to hit user breakpoint after resuming from internal breakpoint: ${error instanceof Error ? error.message : String(error)}`,
    );
    // If we don't hit a user breakpoint, that's okay - execution might have completed
    return undefined;
  }
}

/**
 * Finalizes initialization by cleaning up internal breakpoints and emitting instructions.
 * @param createdBreakpoints - User breakpoints that were created
 * @param internalBreakpoints - Internal breakpoint IDs to clean up
 * @param context - Initialization context
 */
async function finalizeInitialization(
  createdBreakpoints: BreakpointSummary[] | undefined,
  internalBreakpoints: string[],
  context: InitializationContext,
): Promise<void> {
  // Cleanup logic: always clean up internal breakpoints in finalizeInitialization.
  // If we reached this function, we either had no user breakpoints OR had user breakpoints
  // but no initial pause (meaning handleUserBreakpointHit wasn't called and didn't clean up).
  if (context.config.resumeAfterConfigure) {
    // Clear internal breakpoints immediately before resuming
    await clearInternalBreakpoints(internalBreakpoints, context.processManager, context.sessionId);
  } else {
    // Clear internal breakpoints after a delay if we're paused and not resuming
    setTimeout(() => {
      void clearInternalBreakpoints(internalBreakpoints, context.processManager, context.sessionId);
    }, BREAKPOINT_CLEAR_DELAY_MS);
  }

  // Emit instructions based on configuration
  if (context.config.resumeAfterConfigure) {
    emitInstructions(
      context.outputBuffer,
      'Session ready. Execution resumed automatically. Use js-debugger_debuggerCommand for actions like "pause" or "stepOver". Line and column numbers follow CDP zero-based coordinates.',
    );
  } else {
    emitInstructions(
      context.outputBuffer,
      'Session ready. Use js-debugger_debuggerCommand with actions like "continue", "pause", or "stepOver". Include breakpoints.set/remove to adjust breakpoints. Line and column numbers follow CDP zero-based coordinates.',
    );
  }
}

/**
 * Performs the complete session initialization sequence.
 * @param context - Initialization context with session configuration and managers
 * @returns Result containing created breakpoints and initial pause details
 */
export async function performInitialization(
  context: InitializationContext,
): Promise<InitializationResult> {
  // Determine working directory for path resolution
  const targetWorkingDirectory = context.nodeTarget.cwd || process.cwd();

  // Set internal breakpoints at line 0 for all target files
  const targetFiles = collectTargetFiles(
    context.config.breakpoints,
    context.nodeTarget.entry,
    targetWorkingDirectory,
  );
  const internalBreakpoints = await setupInternalBreakpoints(
    targetFiles,
    targetWorkingDirectory,
    context.processManager,
    context.sessionId,
  );

  // Follow the exact WebSocket sequence
  // 1. Runtime.enable (already done in connectToInspector)
  // 2. Debugger.enable (already done in connectToInspector)
  // 3. Internal breakpoints already set above
  // 4. Debugger.pause
  await context.processManager.sendCommand('Debugger.pause');
  // 5. Runtime.runIfWaitingForDebugger
  await tryRunIfWaitingForDebugger((method, params) =>
    context.processManager.sendCommand(method, params),
  );

  // Wait for the initial --inspect-brk pause, then resume to trigger internal breakpoints
  const initialPause = await handleInitialPauseSequence(context);

  // Now set the actual user-requested breakpoints while paused
  let createdBreakpoints: BreakpointSummary[] | undefined;
  if (context.config.breakpoints && context.config.breakpoints.length > 0) {
    const { set } = await context.breakpointManager.applyBreakpointMutation({
      set: context.config.breakpoints,
    });
    if (set.length > 0) {
      createdBreakpoints = set;
    }
  }

  // Handle different initialization paths based on user breakpoints and resume config
  let actualInitialPause = initialPause;
  if (createdBreakpoints && createdBreakpoints.length > 0 && initialPause) {
    actualInitialPause = await handleUserBreakpointHit(
      createdBreakpoints,
      initialPause,
      internalBreakpoints,
      context,
    );
  } else {
    await finalizeInitialization(createdBreakpoints, internalBreakpoints, context);
  }

  return {
    breakpoints: createdBreakpoints,
    initialPause: actualInitialPause,
  };
}
