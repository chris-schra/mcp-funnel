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
 * Context for breakpoint handling operations.
 *
 * Contains shared state references needed by breakpoint handlers to resolve
 * breakpoint locations and track CDP breakpoint registrations.
 * @public
 * @see file:./script-handler.ts - ScriptInfo type definition
 * @see file:../../../cdp/types.ts - CDPBreakpoint type definition
 */
export interface BreakpointHandlerContext {
  /** Map of scriptId to script metadata, used to resolve script URLs to file paths */
  scripts: Map<string, ScriptInfo>;
  /** Map of breakpointId to CDP breakpoint data, updated as breakpoints are resolved */
  breakpoints: Map<string, CDPBreakpoint>;
  /** Project root directory for resolving absolute file paths */
  projectRoot?: string;
  /** Callback invoked when project root is detected and updated from resolved file paths */
  onProjectRootUpdated?: (projectRoot: string) => void;
}

/**
 * Handles Chrome DevTools Protocol Debugger.breakpointResolved event.
 *
 * Processes breakpoint resolution by updating the internal breakpoint registry,
 * mapping CDP locations to file system paths, and notifying all registered handlers.
 * Automatically detects and updates the project root when absolute file paths are
 * first encountered.
 *
 * The function:
 * 1. Updates or creates the CDPBreakpoint entry in the context's breakpoint map
 * 2. Maps the CDP scriptId/lineNumber/columnNumber to file system path using script registry
 * 3. Detects project root from the first absolute file path encountered
 * 4. Emits breakpointResolved event to event emitter and legacy callback handlers
 *
 * This function mutates the context.breakpoints map and may update context.projectRoot
 * via the onProjectRootUpdated callback if an absolute file path is resolved for the
 * first time. Line numbers in CDP are zero-based but are converted to one-based for
 * the BreakpointRegistration that's emitted.
 * @param params - Breakpoint resolution event parameters from CDP
 * @param params.breakpointId - Unique CDP breakpoint identifier
 * @param params.location - Resolved breakpoint location in script coordinates
 * @param params.location.scriptId - Script identifier where breakpoint was resolved
 * @param params.location.lineNumber - Zero-based line number in the script
 * @param params.location.columnNumber - Optional zero-based column number
 * @param context - Shared state context containing script registry and breakpoint map (mutated in place)
 * @param eventEmitter - Emittery instance for publishing breakpointResolved events
 * @param breakpointResolvedHandlers - Array of legacy callback handlers to invoke synchronously
 * @example
 * ```typescript
 * handleBreakpointResolved(
 *   {
 *     breakpointId: 'bp:1:0:script123',
 *     location: { scriptId: 'script123', lineNumber: 42, columnNumber: 10 }
 *   },
 *   context,
 *   eventEmitter,
 *   handlers
 * );
 * // Updates context.breakpoints.get('bp:1:0:script123')
 * // Emits breakpointResolved event with file path and one-based line number
 * ```
 * @public
 * @see file:../../../utils/breakpoints.ts:21 - mapBreakpointLocations implementation
 * @see file:./pause-handler.ts:125 - Alternative usage in pause handler
 * @see file:../event-handlers.ts:267 - Caller that receives CDP events
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
 * Emits breakpoint resolved event to all listeners.
 *
 * Dispatches the breakpoint registration to both the modern event emitter
 * (Emittery-based) and legacy callback handlers. Ensures all registered
 * listeners are notified of breakpoint resolution, with error handling
 * for individual callback failures to prevent cascade failures.
 *
 * Legacy callback handlers are invoked within try-catch blocks. If a handler
 * throws an error, it's logged to console.warn and execution continues with
 * remaining handlers. This prevents one failing handler from blocking others.
 * The event emitter is notified first, followed by legacy handlers, ensuring
 * backward compatibility while supporting modern event-driven architecture.
 * @param registration - Breakpoint registration details including ID, verification status, and resolved locations
 * @param eventEmitter - Emittery instance that emits the 'breakpointResolved' event
 * @param breakpointResolvedHandlers - Array of legacy callback handlers invoked synchronously after event emission
 * @example
 * ```typescript
 * emitBreakpointResolved(
 *   {
 *     id: 'bp:1:0:script123',
 *     verified: true,
 *     resolvedLocations: [{ file: '/project/src/app.ts', line: 43, column: 10 }]
 *   },
 *   eventEmitter,
 *   [handler1, handler2]
 * );
 * // Emits 'breakpointResolved' event, then invokes handler1 and handler2
 * ```
 * @public
 * @see file:../../../types/breakpoint.ts:7 - BreakpointRegistration type definition
 * @see file:../event-handlers.ts:188 - Where handlers are registered
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
