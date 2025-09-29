import { ChildProcess } from 'child_process';
import {
  ICDPClient,
  DebugState,
  ConsoleMessage,
  StackFrame,
} from '../../types/index.js';
import {
  waitForCondition,
  discoverInspectorTargets,
} from '../../utils/node-inspector.js';

/**
 * Connect to Node.js inspector
 */
export async function connectToInspector(
  cdpClient: ICDPClient,
  wsUrl: string,
  inspectorPort: number,
): Promise<void> {
  // If connecting to a specific WebSocket URL directly
  if (wsUrl.startsWith('ws://') || wsUrl.startsWith('wss://')) {
    console.error(`[DEBUG] Attempting to connect to: ${wsUrl}`);
    await waitForCondition(
      async () => {
        try {
          await cdpClient.connect(wsUrl);
          console.error(`[DEBUG] Successfully connected to CDP`);
          return true;
        } catch (error) {
          console.error(
            `[DEBUG] Failed to connect: ${error instanceof Error ? error.message : error}`,
          );
          return null;
        }
      },
      15000, // Increased from 5s to 15s
      500,
    );
    return;
  }

  // If connecting to localhost inspector, try to discover targets first
  try {
    const targets = await discoverInspectorTargets(inspectorPort);
    if (targets.length > 0) {
      await cdpClient.connect(targets[0].webSocketDebuggerUrl);
      return;
    }
  } catch (_error) {
    // Fallback to direct connection
  }

  // Fallback to constructing WebSocket URL
  const fallbackUrl = `ws://localhost:${inspectorPort}`;
  await waitForCondition(
    async () => {
      try {
        await cdpClient.connect(fallbackUrl);
        return true;
      } catch (_error) {
        return null;
      }
    },
    15000, // Increased from 10s to 15s
    500,
  );
  return;
}

/**
 * Map CDP pause reasons to our DebugState pause reasons
 */
export function mapCDPReasonToDebugReason(
  cdpReason: string,
): DebugState['pauseReason'] {
  switch (cdpReason) {
    case 'breakpoint':
      return 'breakpoint';
    case 'step':
    case 'debugCommand':
      return 'step';
    case 'exception':
      return 'exception';
    case 'other':
    case 'pause':
    default:
      return 'entry'; // Default to entry for unknown reasons
  }
}

/**
 * Map CDP console types to our console levels
 */
export function mapConsoleLevel(
  cdpType:
    | 'log'
    | 'debug'
    | 'info'
    | 'error'
    | 'warning'
    | 'dir'
    | 'dirxml'
    | 'table'
    | 'trace'
    | 'clear'
    | 'startGroup'
    | 'startGroupCollapsed'
    | 'endGroup'
    | 'assert'
    | 'profile'
    | 'profileEnd'
    | 'count'
    | 'timeEnd',
): ConsoleMessage['level'] {
  switch (cdpType) {
    case 'warning':
      return 'warn';
    case 'error':
      return 'error';
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    case 'trace':
      return 'trace';
    default:
      return 'log';
  }
}

/**
 * Convert script URL to file path
 */
export function convertScriptUrlToFilePath(scriptUrl: string): string {
  if (!scriptUrl) return '';

  // Handle file:// URLs
  if (scriptUrl.startsWith('file://')) {
    try {
      return new URL(scriptUrl).pathname;
    } catch {
      return scriptUrl.replace('file://', '');
    }
  }

  // Handle other Node.js internal URLs
  if (scriptUrl.startsWith('node:')) {
    return scriptUrl; // Keep Node.js internal modules as-is
  }

  return scriptUrl;
}

/**
 * Convert file path to script URL for breakpoints
 */
export function normalizeFilePath(filePath: string): string {
  // Convert Windows paths to Unix style and resolve relative paths
  const normalized = filePath.replace(/\\/g, '/');
  return normalized;
}

/**
 * Create stack frames from CDP call frames
 */
export function createStackFrames(
  callFrames: Array<{
    functionName: string;
    url?: string;
    location: {
      lineNumber: number;
      columnNumber?: number;
    };
  }>,
): StackFrame[] {
  return callFrames.map((frame, index) => ({
    id: index,
    functionName: frame.functionName || '<anonymous>',
    file: convertScriptUrlToFilePath(frame.url || ''),
    line: frame.location.lineNumber + 1, // Convert back to 1-based
    column: frame.location.columnNumber,
  }));
}

/**
 * Cleanup Node adapter resources
 */
export async function cleanup(
  cdpClient: ICDPClient,
  nodeProcess: ChildProcess | null,
  scriptUrlToId: Map<string, string>,
  scriptIdToUrl: Map<string, string>,
  breakpoints: Map<string, unknown>,
): Promise<void> {
  // Disconnect CDP client
  try {
    await cdpClient.disconnect();
  } catch (error) {
    console.warn('Error disconnecting CDP client:', error);
  }

  // Kill Node.js process if we spawned it
  if (nodeProcess && !nodeProcess.killed) {
    try {
      nodeProcess.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (nodeProcess && !nodeProcess.killed) {
          nodeProcess.kill('SIGKILL');
        }
      }, 2000);
    } catch (error) {
      console.warn('Error killing Node.js process:', error);
    }
  }

  // Clear state
  scriptUrlToId.clear();
  scriptIdToUrl.clear();
  breakpoints.clear();
}
