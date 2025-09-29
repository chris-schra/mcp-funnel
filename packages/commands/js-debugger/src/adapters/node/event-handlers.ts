import {
  ICDPClient,
  DebugState,
  PauseHandler,
  Variable,
} from '../../types/index.js';
import { mapCDPReasonToDebugReason } from './cdp-utils.js';

interface CDPPausedEventParams {
  reason: 'breakpoint' | 'step' | 'exception' | 'other';
  data?: unknown;
  callFrames: Array<{
    callFrameId: string;
    functionName: string;
    location: {
      scriptId: string;
      lineNumber: number;
      columnNumber?: number;
    };
    url?: string;
    scopeChain: Array<{
      type: 'global' | 'local' | 'closure' | 'with' | 'catch';
      object: {
        objectId?: string;
        type: string;
        className?: string;
        description?: string;
      };
      name?: string;
    }>;
  }>;
  exception?: {
    type: string;
    value?: unknown;
    description?: string;
    className?: string;
  };
}

/**
 * Handle debugger paused event
 */
export function handleDebuggerPaused(
  params: CDPPausedEventParams,
  hasResumedFromInitialPause: boolean,
  cdpClient: ICDPClient,
  pauseHandler: PauseHandler | null,
): {
  shouldNotify: boolean;
  callFrames: CDPPausedEventParams['callFrames'];
  debugState: DebugState;
} {
  // Auto-resume the initial pause from --inspect-brk
  if (!hasResumedFromInitialPause && params.reason === 'other') {
    // Auto-resume execution
    cdpClient.send('Debugger.resume').catch(() => {
      // Ignore error - may already be running
    });
    // Don't notify pause handler for this automatic resume
    return {
      shouldNotify: false,
      callFrames: params.callFrames,
      debugState: {
        status: 'paused',
        pauseReason: 'entry',
      },
    };
  }

  const debugState: DebugState = {
    status: 'paused',
    pauseReason: mapCDPReasonToDebugReason(params.reason),
  };

  if (params.exception) {
    debugState.exception = {
      message: params.exception.description || 'Unknown exception',
      uncaught: params.reason === 'exception',
    };
  }

  if (pauseHandler) {
    pauseHandler(debugState);
  }

  return {
    shouldNotify: true,
    callFrames: params.callFrames,
    debugState,
  };
}

/**
 * Get variables for a scope
 */
export async function getVariablesForScope(
  cdpClient: ICDPClient,
  objectId?: string,
): Promise<Variable[]> {
  if (!objectId) return [];

  try {
    const result = await cdpClient.send<{
      result: Array<{
        name: string;
        value: {
          type: string;
          value?: unknown;
          description?: string;
        };
        configurable?: boolean;
        enumerable?: boolean;
      }>;
    }>('Runtime.getProperties', {
      objectId,
      ownProperties: true,
      generatePreview: true,
    });

    return result.result.map((prop) => {
      const runtimeValue = prop.value;

      let value: unknown;
      if (runtimeValue) {
        if (runtimeValue.value !== undefined) {
          value = runtimeValue.value;
        } else if (runtimeValue.description !== undefined) {
          value = runtimeValue.description;
        }
      }

      const inferredType =
        runtimeValue?.type ?? (value !== undefined ? typeof value : 'unknown');

      return {
        name: prop.name,
        value,
        type: inferredType,
        configurable: prop.configurable,
        enumerable: prop.enumerable,
      };
    });
  } catch (error) {
    console.warn('Failed to get scope variables:', error);
    return [];
  }
}
