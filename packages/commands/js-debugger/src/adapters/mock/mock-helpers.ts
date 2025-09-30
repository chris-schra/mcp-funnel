import * as path from 'path';
import type {
  CallToolResult,
  DebugLocation,
  MockDebugSession,
} from '../../types/index.js';
import type { MockVariableScopes } from './mock-data.js';

/**
 * Constructs a mock debug location object from file path and line number.
 *
 * Converts relative file paths to absolute paths and generates a workspace-relative
 * path for display purposes. Used by the mock debug adapter to simulate breakpoint
 * locations.
 * @param file - File path (relative or absolute)
 * @param line - Line number in the file (1-based)
 * @returns Debug location with absolute and relative paths
 * @internal
 * @see file:./mock-adapter.ts:50 - Usage in createInitialResponse
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
 * Resolves and accesses variables in mock debug session using dot-notation paths.
 *
 * Traverses mock variable scopes (local and closure) to find the requested variable
 * by path. Returns formatted results including the value, type, and any errors
 * encountered during traversal.
 * @param sessionId - Debug session identifier
 * @param path - Dot-notation path to variable (e.g., "userData.profile.settings.theme")
 * @param frameId - Stack frame identifier (currently unused in mock implementation)
 * @param mockVariables - Mock variable scopes containing local and closure variables
 * @returns Serialized variable inspection result with success or error details
 * @internal
 * @see file:./mock-adapter.ts:252 - Usage in createVariablesResponse
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
 * Converts variable inspection results into standardized MCP tool response format.
 *
 * Serializes variable access results (both successful and failed) into the
 * CallToolResult format expected by the MCP protocol. Includes session context,
 * frame information, and detailed result data in JSON format.
 * @param sessionId - Debug session identifier
 * @param frameId - Stack frame identifier
 * @param path - Dot-notation variable path that was accessed
 * @param result - Inspection result object
 * @param result.found - Whether the variable was successfully located
 * @param result.value - The variable's value (when found)
 * @param result.type - The variable's type (when found)
 * @param result.error - Error message (when not found)
 * @param isError - Whether this represents an error response (default: false)
 * @returns Formatted tool result with JSON-serialized content
 * @internal
 * @see file:./mock-helpers.ts:39 - Usage in handleMockPathAccess
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
 * Creates a standardized error response for failed mock debug operations.
 *
 * Generates an MCP-compliant error response with session context and optional
 * operation details. Used throughout the mock adapter to report failures
 * consistently.
 * @param sessionId - Debug session identifier
 * @param error - Error message describing what went wrong
 * @param operation - Optional operation name that failed (e.g., "continue", "getVariables")
 * @returns Error tool result with isError flag set to true
 * @internal
 * @see file:../mock-session-manager.ts:86 - Usage when session not found
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
 * Creates a standardized success response for mock debug operations.
 *
 * Generates an MCP-compliant success response with session context, operation
 * data, and an optional message. Formats the response as pretty-printed JSON
 * for readability.
 * @param sessionId - Debug session identifier
 * @param data - Operation result data to include in response
 * @param message - Optional success message (default: "[MOCK] Operation completed successfully")
 * @returns Success tool result with formatted JSON content
 * @internal
 * @see file:./mock-adapter.ts:40 - Usage in createInitialResponse
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
 * Validates and normalizes variable path input for mock variable access.
 *
 * Ensures the path is a non-empty string after trimming whitespace. Returns
 * null for invalid inputs (non-strings or empty strings).
 * @param path - Variable path to validate (accepts unknown for runtime validation)
 * @returns Trimmed path string, or null if invalid
 * @internal
 * @see file:../mock-session-manager.ts:200 - Usage before accessing variables
 */
export const validateAndNormalizePath = (path: unknown): string | null => {
  const trimmedPath = typeof path === 'string' ? path.trim() : '';
  return trimmedPath || null;
};

/**
 * Generates a human-readable location label for display purposes.
 *
 * Prefers the relative path from workspace root when available, falling back
 * to absolute path or the provided fallback string.
 * @param location - Debug location object with path information
 * @param fallback - Fallback label when location has no path information
 * @returns Display-friendly location string
 * @internal
 * @see file:./mock-adapter.ts:53 - Usage in formatting pause messages
 */
export const generateLocationLabel = (
  location: DebugLocation,
  fallback: string,
): string => {
  return location.relativePath || location.file || fallback;
};

/**
 * Generates a line number suffix for location display.
 *
 * Formats line numbers as ":N" when present, or returns empty string when
 * line number is undefined.
 * @param line - Line number (1-based, optional)
 * @returns Formatted line suffix (e.g., ":42") or empty string
 * @internal
 * @see file:./mock-adapter.ts:52 - Usage in formatting pause messages
 */
export const generateLineSuffix = (line?: number): string => {
  return line ? `:${line}` : '';
};

/**
 * Determines if a mock debug session should be automatically terminated.
 *
 * Sessions without breakpoints complete immediately since there are no pause
 * points to simulate. This prevents unnecessary session lifecycle overhead.
 * @param session - Mock debug session to check
 * @returns True if session has no breakpoints and should terminate immediately
 * @internal
 * @see file:../mock-session-manager.ts:123 - Usage in initial response creation
 */
export const shouldAutoTerminateSession = (
  session: MockDebugSession,
): boolean => {
  return (
    !session.request.breakpoints || session.request.breakpoints.length === 0
  );
};

/**
 * Checks if a mock session has visited all configured breakpoints.
 *
 * Compares the current breakpoint index against the total breakpoint count
 * to determine if the session should complete.
 * @param session - Mock debug session to check
 * @returns True if all breakpoints have been visited
 * @internal
 * @see file:./mock-adapter.ts:119 - Usage in continue response logic
 * @see file:../mock-session-manager.ts:101 - Usage to terminate sessions
 */
export const hasReachedEndOfBreakpoints = (
  session: MockDebugSession,
): boolean => {
  const breakpointCount = session.request.breakpoints?.length || 0;
  return session.currentBreakpointIndex >= breakpointCount;
};
