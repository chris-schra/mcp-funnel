import { SourceMapConsumer } from 'source-map';
import {
  CDPBreakpoint,
  CDPDebuggerPausedParams,
  CDPScriptParsedParams,
  CDPConsoleAPICalledParams,
  CDPExceptionThrownParams,
} from '../cdp/index.js';
import { DebugState, PauseHandler, ConsoleHandler } from '../types/index.js';
import {
  mapPauseReason,
  formatConsoleMessage,
  formatExceptionMessage,
  invokeHandlers,
} from './browser-adapter-utils.js';
import { loadSourceMap } from './browser-cdp-setup.js';

/**
 * Handle debugger paused event
 */
export function handleDebuggerPaused(
  params: CDPDebuggerPausedParams,
  breakpoints: Map<string, CDPBreakpoint>,
  pauseHandlers: PauseHandler[],
): {
  callFrames: CDPDebuggerPausedParams['callFrames'];
  debugState: DebugState;
} {
  const debugState: DebugState = {
    status: 'paused',
    pauseReason: mapPauseReason(params.reason),
  };

  if (params.hitBreakpoints && params.hitBreakpoints.length > 0) {
    const breakpointId = params.hitBreakpoints[0];
    const breakpoint = breakpoints.get(breakpointId);

    if (breakpoint) {
      debugState.breakpoint = {
        id: breakpointId,
        file: '', // This needs to be mapped from script URL
        line: breakpoint.locations[0]?.lineNumber || 0,
      };
    }
  }

  // Notify pause handlers
  invokeHandlers(pauseHandlers, debugState, 'pause');

  return {
    callFrames: params.callFrames,
    debugState,
  };
}

/**
 * Handle script parsed event
 */
export function handleScriptParsed(
  params: CDPScriptParsedParams,
  scripts: Map<
    string,
    { url: string; source?: string; sourceMap?: SourceMapConsumer }
  >,
): void {
  scripts.set(params.scriptId, {
    url: params.url,
    sourceMap: undefined, // Will be loaded if needed
  });

  // Load source map if available
  if (params.sourceMapURL) {
    loadSourceMap(params.sourceMapURL)
      .then((sourceMap) => {
        if (sourceMap) {
          const script = scripts.get(params.scriptId);
          if (script) {
            script.sourceMap = sourceMap;
          }
        }
      })
      .catch((error) => {
        console.warn(`Failed to load source map for ${params.url}:`, error);
      });
  }
}

/**
 * Handle console message event
 */
export function handleConsoleMessage(
  params: CDPConsoleAPICalledParams,
  consoleHandlers: ConsoleHandler[],
): void {
  const message = formatConsoleMessage(params);
  invokeHandlers(consoleHandlers, message, 'console');
}

/**
 * Handle exception event
 */
export function handleException(
  params: CDPExceptionThrownParams,
  consoleHandlers: ConsoleHandler[],
): void {
  const message = formatExceptionMessage(params);
  invokeHandlers(consoleHandlers, message, 'console');
}
