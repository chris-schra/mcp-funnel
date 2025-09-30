import type {
  DebugState,
  DebugRequest,
  PauseHandler,
} from '../../types/index.js';
import type { CDPDebuggerPausedParams } from '../../cdp/types.js';
import { mapCDPPauseReason } from '../../cdp/pause-reason-mapper.js';

export interface PausePromiseInfo {
  resolve: (state: DebugState) => void;
  reject: (error: Error) => void;
  timeout?: NodeJS.Timeout;
}

/**
 * Handles pause-related operations for the Node debug adapter
 */
export class PauseHandlerManager {
  private pausePromises = new Set<PausePromiseInfo>();

  constructor(
    private scriptIdToUrl: Map<string, string>,
    private request?: DebugRequest,
  ) {}

  /**
   * Wait for the debugger to pause
   */
  async waitForPause(
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
   * Handle CDP paused event and build debug state
   */
  handlePaused(
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
   * Reject all pending pause promises (e.g., on session termination)
   */
  rejectPendingPromises(error: Error): void {
    Array.from(this.pausePromises).forEach((promise) => {
      if (promise.timeout) {
        clearTimeout(promise.timeout);
      }
      promise.reject(error);
    });
    this.pausePromises.clear();
  }

  /**
   * Extract call frame info from paused params
   */
  extractCallFrameInfo(params: CDPDebuggerPausedParams): {
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
