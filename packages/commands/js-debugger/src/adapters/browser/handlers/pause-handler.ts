import Emittery from 'emittery';
import path from 'path';
import type {
  DebugState,
  DebugSessionEvents,
  PauseHandler,
  ResumeHandler,
} from '../../../types/index.js';
import type {
  CDPBreakpoint,
  CDPCallFrame,
  CDPDebuggerPausedParams,
} from '../../../cdp/index.js';
import { mapBreakpointLocations } from '../../../utils/breakpoints.js';
import {
  urlToFilePath,
  createDebugLocation,
  mapPauseReason,
} from '../utils/location-mapper.js';
import { emitBreakpointResolved } from './breakpoint-handler.js';
import type { ScriptInfo } from './script-handler.js';

/**
 * Context for pause handling operations
 */
export interface PauseHandlerContext {
  scripts: Map<string, ScriptInfo>;
  breakpoints: Map<string, CDPBreakpoint>;
  currentCallFrames: CDPCallFrame[];
  debugState: DebugState;
  projectRoot?: string;
  pausePromises: Set<{
    resolve: (state: DebugState) => void;
    reject: (error: Error) => void;
    timeout?: NodeJS.Timeout;
  }>;
  onStateUpdated?: (state: DebugState) => void;
  onProjectRootUpdated?: (projectRoot: string) => void;
}

/**
 * Handles debugger paused event
 */
export function handleDebuggerPaused(
  params: CDPDebuggerPausedParams,
  context: PauseHandlerContext,
  eventEmitter: Emittery<DebugSessionEvents>,
  pauseHandlers: PauseHandler[],
  breakpointResolvedHandlers: Array<
    (
      registration: import('../../../types/index.js').BreakpointRegistration,
    ) => void
  >,
): DebugState {
  // Update the shared array in place to maintain reference
  context.currentCallFrames.length = 0;
  context.currentCallFrames.push(...params.callFrames);

  const newDebugState: DebugState = {
    status: 'paused',
    pauseReason: mapPauseReason(params.reason),
  };

  const topFrame = params.callFrames[0];
  if (topFrame) {
    const location = createDebugLocation(topFrame, context.projectRoot);
    if (location) {
      newDebugState.location = location;
    }
  }

  if (params.hitBreakpoints && params.hitBreakpoints.length > 0) {
    const breakpointId = params.hitBreakpoints[0];
    const breakpoint = context.breakpoints.get(breakpointId);
    const resolvedLocations = breakpoint
      ? mapBreakpointLocations(breakpoint.locations, {
          resolveScriptUrl: (scriptId) => context.scripts.get(scriptId)?.url,
          convertScriptUrlToPath: (scriptUrl) => urlToFilePath(scriptUrl),
          onPathResolved: (filePath) => {
            if (!context.projectRoot && path.isAbsolute(filePath)) {
              const newProjectRoot = path.dirname(filePath).replace(/\\/g, '/');
              context.projectRoot = newProjectRoot;
              context.onProjectRootUpdated?.(newProjectRoot);
            }
          },
        })
      : [];

    if (resolvedLocations.length === 0 && topFrame) {
      const fallbackLocation = createDebugLocation(
        topFrame,
        context.projectRoot,
      );
      if (fallbackLocation?.file) {
        resolvedLocations.push({
          file: fallbackLocation.file,
          line: fallbackLocation.line || topFrame.location.lineNumber + 1,
          column: fallbackLocation.column ?? topFrame.location.columnNumber,
        });
      }
    }

    if (breakpoint) {
      newDebugState.breakpoint = {
        id: breakpointId,
        file:
          resolvedLocations[0]?.file ||
          urlToFilePath(topFrame?.url || '') ||
          '[unknown]',
        line:
          resolvedLocations[0]?.line ||
          (topFrame ? topFrame.location.lineNumber + 1 : 0),
        condition: undefined,
        verified: resolvedLocations.length > 0,
        resolvedLocations:
          resolvedLocations.length > 0 ? resolvedLocations : undefined,
      };

      if (resolvedLocations.length > 0) {
        emitBreakpointResolved(
          {
            id: breakpointId,
            verified: true,
            resolvedLocations,
          },
          eventEmitter,
          breakpointResolvedHandlers,
        );
      }
    }
  }

  // Update context state
  context.debugState = newDebugState;

  // Update main adapter's state after all modifications
  context.onStateUpdated?.(newDebugState);

  // Resolve any pending pause promises
  Array.from(context.pausePromises).forEach((promise) => {
    if (promise.timeout) {
      clearTimeout(promise.timeout);
    }
    promise.resolve(newDebugState);
  });
  context.pausePromises.clear();

  // Emit typed event
  eventEmitter.emit('paused', newDebugState);

  // Notify pause handlers (legacy callback support)
  pauseHandlers.forEach((handler) => {
    try {
      handler(newDebugState);
    } catch (error) {
      console.warn('Error in pause handler:', error);
    }
  });

  return newDebugState;
}

/**
 * Handles debugger resumed event
 */
export function handleDebuggerResumed(
  context: PauseHandlerContext,
  eventEmitter: Emittery<DebugSessionEvents>,
  resumeHandlers: ResumeHandler[],
): DebugState {
  const newDebugState: DebugState = { status: 'running' };
  context.currentCallFrames.length = 0;

  // Update context state
  context.debugState = newDebugState;

  // Update main adapter's state
  context.onStateUpdated?.(newDebugState);

  // Emit typed event
  eventEmitter.emit('resumed', undefined);

  // Notify resume handlers (legacy callback support)
  resumeHandlers.forEach((handler) => {
    try {
      handler();
    } catch (error) {
      console.warn('Error in resume handler:', error);
    }
  });

  return newDebugState;
}
