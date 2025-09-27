import Emittery from 'emittery';
import path from 'path';
import type {
  BreakpointRegistration,
  DebugSessionEvents,
} from '../../../types/index.js';
import type { CDPBreakpoint } from '../../../cdp/index.js';
import { mapBreakpointLocations } from '../../../utils/breakpoints.js';
import { urlToFilePath } from '../utils/location-mapper.js';
import type { ScriptInfo } from './script-handler.js';

/**
 * Context for breakpoint handling operations
 */
export interface BreakpointHandlerContext {
  scripts: Map<string, ScriptInfo>;
  breakpoints: Map<string, CDPBreakpoint>;
  projectRoot?: string;
  onProjectRootUpdated?: (projectRoot: string) => void;
}

/**
 * Handles breakpoint resolved event
 */
export function handleBreakpointResolved(
  params: {
    breakpointId: string;
    location: {
      scriptId: string;
      lineNumber: number;
      columnNumber?: number;
    };
  },
  context: BreakpointHandlerContext,
  eventEmitter: Emittery<DebugSessionEvents>,
  breakpointResolvedHandlers: Array<
    (registration: BreakpointRegistration) => void
  >,
): void {
  const breakpoint = context.breakpoints.get(params.breakpointId);
  const normalizedLocation = {
    scriptId: params.location.scriptId,
    lineNumber: params.location.lineNumber,
    columnNumber: params.location.columnNumber,
  };

  if (breakpoint) {
    const locations = breakpoint.locations || [];
    const alreadyRecorded = locations.some(
      (loc) =>
        loc.scriptId === normalizedLocation.scriptId &&
        loc.lineNumber === normalizedLocation.lineNumber &&
        loc.columnNumber === normalizedLocation.columnNumber,
    );
    if (!alreadyRecorded) {
      locations.push(normalizedLocation);
    }
  } else {
    context.breakpoints.set(params.breakpointId, {
      breakpointId: params.breakpointId,
      locations: [normalizedLocation],
    });
  }

  const resolvedLocations = mapBreakpointLocations([normalizedLocation], {
    resolveScriptUrl: (scriptId) => context.scripts.get(scriptId)?.url,
    convertScriptUrlToPath: (scriptUrl) => urlToFilePath(scriptUrl),
    onPathResolved: (filePath) => {
      if (!context.projectRoot && path.isAbsolute(filePath)) {
        const newProjectRoot = path.dirname(filePath).replace(/\\/g, '/');
        context.projectRoot = newProjectRoot;
        context.onProjectRootUpdated?.(newProjectRoot);
      }
    },
  });

  emitBreakpointResolved(
    {
      id: params.breakpointId,
      verified: resolvedLocations.length > 0,
      resolvedLocations,
    },
    eventEmitter,
    breakpointResolvedHandlers,
  );
}

/**
 * Emits breakpoint resolved event to all listeners
 */
export function emitBreakpointResolved(
  registration: BreakpointRegistration,
  eventEmitter: Emittery<DebugSessionEvents>,
  breakpointResolvedHandlers: Array<
    (registration: BreakpointRegistration) => void
  >,
): void {
  // Emit typed event
  eventEmitter.emit('breakpointResolved', registration);

  // Notify handlers (legacy callback support)
  for (const handler of breakpointResolvedHandlers) {
    try {
      handler(registration);
    } catch (error) {
      console.warn('Error in breakpoint resolved handler:', error);
    }
  }
}
