import * as path from 'path';
import type {
  CallToolResult,
  DebugLocation,
  MockDebugSession,
} from '../../types/index.js';
import type { MockVariableScopes } from './mock-data.js';

/**
 * Build a mock debug location from file and line
 */
export const buildMockLocation = (
  file: string,
  line: number,
): DebugLocation => {
  const absolute = path.isAbsolute(file)
    ? file
    : path.resolve(process.cwd(), file);
  const relative = path.relative(process.cwd(), absolute).replace(/\\/g, '/');

  return {
    type: 'user',
    file: absolute,
    line,
    relativePath: relative,
    description: 'Mock user code',
  };
};

/**
 * Handle path-based variable access in mock variables
 */
export const handleMockPathAccess = (
  sessionId: string,
  path: string,
  frameId: number,
  mockVariables: MockVariableScopes,
): CallToolResult => {
  const pathParts = path.split('.');
  const [root, ...rest] = pathParts;

  try {
    let current: unknown;

    if (root in mockVariables.local) {
      current = mockVariables.local[root];
    } else if (root in mockVariables.closure) {
      current = mockVariables.closure[root];
    } else {
      return serializeMockVariableResult(sessionId, frameId, path, {
        found: false,
        error: `Variable '${root}' not found in mock session`,
      });
    }

    for (const part of rest) {
      if (
        current !== null &&
        typeof current === 'object' &&
        part in (current as Record<string, unknown>)
      ) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return serializeMockVariableResult(sessionId, frameId, path, {
          found: false,
          error: `Property '${part}' not found while traversing '${path}'`,
        });
      }
    }

    return serializeMockVariableResult(sessionId, frameId, path, {
      found: true,
      value: current,
      type: Array.isArray(current) ? 'array' : typeof current,
    });
  } catch (error) {
    return serializeMockVariableResult(
      sessionId,
      frameId,
      path,
      {
        found: false,
        error: `[MOCK] Error accessing path '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
      },
      true,
    );
  }
};

/**
 * Serialize mock variable result into CallToolResult format
 */
export const serializeMockVariableResult = (
  sessionId: string,
  frameId: number,
  path: string,
  result: {
    found: boolean;
    value?: unknown;
    type?: string;
    error?: string;
  },
  isError = false,
): CallToolResult => {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            sessionId,
            frameId,
            path,
            result,
            message: `[MOCK] Variable inspection for path: ${path}`,
          },
          null,
          2,
        ),
      },
    ],
    isError,
  };
};

/**
 * Create a standardized error response for mock operations
 */
export const createMockErrorResponse = (
  sessionId: string,
  error: string,
  operation?: string,
): CallToolResult => {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          error,
          sessionId,
          operation,
        }),
      },
    ],
    isError: true,
  };
};

/**
 * Create a standardized success response for mock operations
 */
export const createMockSuccessResponse = (
  sessionId: string,
  data: Record<string, unknown>,
  message?: string,
): CallToolResult => {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            sessionId,
            ...data,
            message: message || '[MOCK] Operation completed successfully',
          },
          null,
          2,
        ),
      },
    ],
  };
};

/**
 * Validate and normalize variable path for mock access
 */
export const validateAndNormalizePath = (path: unknown): string | null => {
  const trimmedPath = typeof path === 'string' ? path.trim() : '';
  return trimmedPath || null;
};

/**
 * Generate location label for display purposes
 */
export const generateLocationLabel = (
  location: DebugLocation,
  fallback: string,
): string => {
  return location.relativePath || location.file || fallback;
};

/**
 * Generate line suffix for location display
 */
export const generateLineSuffix = (line?: number): string => {
  return line ? `:${line}` : '';
};

/**
 * Check if a mock session should be auto-terminated (e.g., no breakpoints)
 */
export const shouldAutoTerminateSession = (
  session: MockDebugSession,
): boolean => {
  return (
    !session.request.breakpoints || session.request.breakpoints.length === 0
  );
};

/**
 * Check if session has reached the end of breakpoints
 */
export const hasReachedEndOfBreakpoints = (
  session: MockDebugSession,
): boolean => {
  const breakpointCount = session.request.breakpoints?.length || 0;
  return session.currentBreakpointIndex >= breakpointCount;
};
