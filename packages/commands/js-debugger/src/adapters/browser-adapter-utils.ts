import { StackFrame, ConsoleMessage, Scope, Variable } from '../types/index.js';
import {
  CDPStackTrace,
  CDPGetPropertiesResult,
  CDPCallFrame,
} from '../cdp/index.js';
import { CDPClient } from '../cdp/client.js';

/**
 * Convert file path to URL for browser context
 */
export function filePathToUrl(filePath: string): string {
  // For browser debugging, we expect URLs rather than file paths
  // If it's already a URL, return as-is
  if (
    filePath.startsWith('http://') ||
    filePath.startsWith('https://') ||
    filePath.startsWith('file://')
  ) {
    return filePath;
  }

  // Convert relative paths to file:// URLs as fallback
  if (filePath.startsWith('/')) {
    return `file://${filePath}`;
  }

  return `file://${filePath}`;
}

/**
 * Convert URL back to file path for display
 */
export function urlToFilePath(url: string): string {
  if (url.startsWith('file://')) {
    return url.slice(7);
  }
  return url;
}

/**
 * Map CDP pause reasons to our debug state reasons
 */
export function mapPauseReason(
  reason: string,
): 'breakpoint' | 'step' | 'exception' | 'entry' {
  switch (reason) {
    case 'breakpoint':
      return 'breakpoint';
    case 'exception':
      return 'exception';
    case 'debugCommand':
      return 'step';
    default:
      return 'entry';
  }
}

/**
 * Map CDP console types to our console levels
 */
export function mapConsoleLevel(
  type: string,
): 'log' | 'debug' | 'info' | 'warn' | 'error' | 'trace' {
  switch (type) {
    case 'warning':
      return 'warn';
    case 'trace':
      return 'trace';
    case 'error':
      return 'error';
    case 'debug':
      return 'debug';
    case 'info':
      return 'info';
    default:
      return 'log';
  }
}

/**
 * Parse CDP stack trace to our format
 */
export function parseStackTrace(stackTrace: CDPStackTrace): StackFrame[] {
  if (!stackTrace?.callFrames) {
    return [];
  }

  return stackTrace.callFrames.map((frame, index: number) => ({
    id: index,
    functionName: frame.functionName || '(anonymous)',
    file: urlToFilePath(frame.url),
    line: (frame.lineNumber || 0) + 1,
    column: frame.columnNumber,
  }));
}

/**
 * Format console message from CDP console API params
 */
export function formatConsoleMessage(params: {
  type: string;
  timestamp: number;
  args: Array<{
    type: string;
    value?: unknown;
    description?: string;
  }>;
  stackTrace?: CDPStackTrace;
}): ConsoleMessage {
  return {
    level: mapConsoleLevel(params.type),
    timestamp: new Date(params.timestamp).toISOString(),
    message: params.args
      .map((arg) => arg.description || String(arg.value || ''))
      .join(' '),
    args: params.args.map((arg) => arg.value),
    stackTrace: params.stackTrace
      ? parseStackTrace(params.stackTrace)
      : undefined,
  };
}

/**
 * Format exception message from CDP exception thrown params
 */
export function formatExceptionMessage(params: {
  exceptionDetails: {
    exception?: {
      description?: string;
      value?: unknown;
    };
    text: string;
    stackTrace?: CDPStackTrace;
  };
}): ConsoleMessage {
  return {
    level: 'error',
    timestamp: new Date().toISOString(),
    message:
      params.exceptionDetails.exception?.description ||
      params.exceptionDetails.text,
    args: [params.exceptionDetails.exception?.value],
    stackTrace: params.exceptionDetails.stackTrace
      ? parseStackTrace(params.exceptionDetails.stackTrace)
      : undefined,
  };
}

/**
 * Get variable scopes for a call frame
 */
export async function getScopesForFrame(
  cdpClient: CDPClient,
  frame: CDPCallFrame,
): Promise<Scope[]> {
  const scopes: Scope[] = [];

  for (const scopeChain of frame.scopeChain) {
    if (!scopeChain.object.objectId) {
      continue;
    }

    try {
      const properties = await cdpClient.send<CDPGetPropertiesResult>(
        'Runtime.getProperties',
        {
          objectId: scopeChain.object.objectId,
          ownProperties: true,
        },
      );

      const variables: Variable[] = properties.result.map((prop) => ({
        name: prop.name,
        value: prop.value.value,
        type: prop.value.type,
        configurable: prop.configurable,
        enumerable: prop.enumerable,
      }));

      const scopeType =
        scopeChain.type === 'script' ? 'global' : scopeChain.type;
      scopes.push({
        type: scopeType as Scope['type'],
        name: scopeChain.name,
        variables,
      });
    } catch (error) {
      console.warn(
        `Failed to get properties for scope ${scopeChain.type}:`,
        error,
      );
    }
  }

  return scopes;
}

/**
 * Safely invoke handlers with error handling
 */
export function invokeHandlers<T>(
  handlers: Array<(arg: T) => void>,
  arg: T,
  handlerType: string,
): void {
  handlers.forEach((handler) => {
    try {
      handler(arg);
    } catch (error) {
      console.warn(`Error in ${handlerType} handler:`, error);
    }
  });
}
