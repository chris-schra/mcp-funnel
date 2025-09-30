import type {
  DebugState,
  DebugRequest,
  PauseHandler,
} from '../../types/index.js';
import type { CDPDebuggerPausedParams } from '../../cdp/types.js';
import { mapCDPPauseReason } from '../../cdp/pause-reason-mapper.js';

/**
 * Internal promise tracking structure for pause operations.
 * Used to manage multiple concurrent waitForPause() calls and ensure
 * all waiting callers are resolved when the debugger pauses.
 * @see file:./pause-handler.ts:31 - waitForPause implementation
 * @internal
 */
export interface PausePromiseInfo {
  /** Resolves the promise with the debug state when pause occurs */
  resolve: (state: DebugState) => void;
  /** Rejects the promise if timeout or session termination occurs */
  reject: (error: Error) => void;
  /** Optional timeout handle for cleanup on resolution */
  timeout?: NodeJS.Timeout;
}

/**
 * Manages pause-related operations for Node.js debugging sessions.
 * This class coordinates waiting for debugger pause events, resolving pending
 * promises when pauses occur, and building DebugState from CDP pause events.
 * It handles multiple concurrent waitForPause() calls and maintains script ID
 * to file URL mappings for accurate location reporting.
 *
 * Key responsibilities:
 * - Managing concurrent waitForPause() promises with timeout handling
 * - Transforming CDP paused events into structured DebugState objects
 * - Resolving file locations from script IDs and request targets
 * - Extracting call frame information for evaluation context
 * @example
 * ```typescript
 * const manager = new PauseHandlerManager(scriptIdToUrl, request);
 * // Wait for next pause
 * const state = await manager.waitForPause(5000, currentState);
 * // Or handle CDP pause event
 * const newState = manager.handlePaused(cdpParams, pauseCallback);
 * ```
 * @see file:../../types/debug-state.ts - DebugState structure
 * @see file:./event-handlers.ts:206 - Usage in event handling
 * @public
 */
export class PauseHandlerManager {
  private pausePromises = new Set<PausePromiseInfo>();

  public constructor(
    private scriptIdToUrl: Map<string, string>,
    private request?: DebugRequest,
  ) {}

  /**
   * Waits for the debugger to pause, or returns immediately if already paused.
   * Creates a promise that will be resolved when handlePaused() processes a
   * CDP Debugger.paused event. Multiple concurrent calls are supported - all
   * waiting promises will be resolved when the pause occurs. If a timeout
   * occurs before pause, the promise is rejected and removed from tracking.
   * @param timeoutMs - Maximum milliseconds to wait before rejecting (default: 30000)
   * @param currentState - Current debug state to check if already paused
   * @returns Promise resolving to the paused DebugState
   * @throws When timeout expires before pause occurs
   * @example
   * ```typescript
   * try {
   *   const state = await manager.waitForPause(5000, currentState);
   *   console.log(`Paused at ${state.location?.file}:${state.location?.line}`);
   * } catch (err) {
   *   console.error('Timeout waiting for pause');
   * }
   * ```
   * @see file:./pause-handler.ts:113 - handlePaused() which resolves these promises
   * @public
   */
  public async waitForPause(
    timeoutMs = 30000,
    currentState: DebugState,
  ): Promise<DebugState> {
    // If already paused, return current state immediately
    if (currentState.status === 'paused') {
      return currentState;
    }

    return new Promise<DebugState>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pausePromises.delete(promiseInfo);
        reject(new Error(`waitForPause timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const promiseInfo: PausePromiseInfo = {
        resolve,
        reject,
        timeout,
      };

      this.pausePromises.add(promiseInfo);
    });
  }

  /**
   * Processes a CDP Debugger.paused event and constructs the corresponding DebugState.
   * Transforms raw CDP pause parameters into a structured DebugState object by:
   * - Resolving file paths from script IDs or falling back to request target
   * - Mapping CDP pause reasons to our normalized pause reason types
   * - Extracting location info with 1-based line numbers (CDP uses 0-based)
   * - Including exception details if the pause was due to an exception
   * - Resolving all pending waitForPause() promises with the new state
   *
   * This method resolves ALL waiting promises registered via waitForPause(),
   * clears their timeouts, and invokes the optional legacy pauseHandler callback.
   * @param params - CDP Debugger.paused event parameters containing call frames and reason
   * @param pauseHandler - Optional legacy callback invoked after state construction
   * @returns The constructed DebugState with status 'paused'
   * @example
   * ```typescript
   * cdpClient.on('Debugger.paused', (params) => {
   *   const state = manager.handlePaused(params, (state) => {
   *     console.log('Legacy callback:', state);
   *   });
   *   // state.status === 'paused'
   *   // All waitForPause() promises have been resolved
   * });
   * ```
   * @see file:../../cdp/types.ts:49 - CDPDebuggerPausedParams structure
   * @see file:../../cdp/pause-reason-mapper.ts - Reason mapping logic
   * @public
   */
  public handlePaused(
    params: CDPDebuggerPausedParams,
    pauseHandler?: PauseHandler,
  ): DebugState {
    const firstFrame = params.callFrames[0];
    let resolvedFile = firstFrame
      ? firstFrame.url || this.scriptIdToUrl.get(firstFrame.location.scriptId)
      : undefined;

    // Fallback: if we have no URL but have a request target, use that
    if (!resolvedFile && this.request?.target && firstFrame) {
      // For the main script being debugged, use the target path
      resolvedFile = this.request.target;
    }

    // Map pause reason using the proper mapper
    const pauseReason = mapCDPPauseReason(params.reason);

    // Build debug state
    const debugState: DebugState = {
      status: 'paused',
      pauseReason,
      location: params.callFrames[0]
        ? {
            type: 'user',
            file: resolvedFile,
            line: params.callFrames[0].location.lineNumber + 1,
            column: params.callFrames[0].location.columnNumber,
          }
        : undefined,
      exception: params.exception
        ? {
            message: String(
              params.exception.description || params.exception.value,
            ),
            uncaught: true,
          }
        : undefined,
    };

    // Resolve any pending pause promises
    Array.from(this.pausePromises).forEach((promise) => {
      if (promise.timeout) {
        clearTimeout(promise.timeout);
      }
      promise.resolve(debugState);
    });
    this.pausePromises.clear();

    // Call legacy callback for backward compatibility
    pauseHandler?.(debugState);

    return debugState;
  }

  /**
   * Rejects all pending waitForPause() promises with the provided error.
   * Called during session termination or fatal errors to ensure no promises
   * remain hanging. Clears all timeouts and empties the promise tracking set.
   * This prevents memory leaks and provides proper error propagation to callers.
   * @param error - Error to reject all pending promises with
   * @example
   * ```typescript
   * // During adapter disconnect
   * const terminationError = new Error('Debug session terminated');
   * manager.rejectPendingPromises(terminationError);
   * // All waitForPause() callers receive rejection
   * ```
   * @see file:../node-adapter.ts:230 - Called during adapter termination
   * @public
   */
  public rejectPendingPromises(error: Error): void {
    Array.from(this.pausePromises).forEach((promise) => {
      if (promise.timeout) {
        clearTimeout(promise.timeout);
      }
      promise.reject(error);
    });
    this.pausePromises.clear();
  }

  /**
   * Extracts call frame information for evaluation context from CDP pause event.
   * Returns the top call frame ID and full call frame array if available.
   * These are used to set the evaluation context in the adapter, allowing
   * variable inspection and expression evaluation within the paused scope.
   * Returns undefined values if no call frames are present in the pause event.
   * @param params - CDP Debugger.paused event parameters
   * @returns Object containing currentCallFrameId and currentCallFrames, or undefined values
   * @see file:./event-handlers.ts:298 - Used to set evaluation context
   * @public
   */
  public extractCallFrameInfo(params: CDPDebuggerPausedParams): {
    currentCallFrameId?: string;
    currentCallFrames?: CDPDebuggerPausedParams['callFrames'];
  } {
    if (params.callFrames.length > 0) {
      return {
        currentCallFrameId: params.callFrames[0].callFrameId,
        currentCallFrames: params.callFrames,
      };
    }
    return {
      currentCallFrameId: undefined,
      currentCallFrames: undefined,
    };
  }
}
