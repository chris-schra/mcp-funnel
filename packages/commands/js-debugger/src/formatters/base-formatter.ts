import type {
  CallToolResult,
  IResponseFormatter,
  DebugSession,
  CodeOrigin,
} from '../types/index.js';

/**
 * Base response formatter providing core success/error formatting functionality.
 * This abstract class implements the IResponseFormatter SEAM (extension point)
 * to eliminate JSON formatting duplication across all debug tool handlers.
 * Concrete formatters inherit common success/error methods and implement
 * domain-specific formatting for debug states, sessions, and variables.
 * The formatter architecture separates concerns:
 * - BaseResponseFormatter: Core JSON serialization (this class)
 * - DebugResponseFormatter: Coordinates specialized formatters
 * - SessionFormatter/StackFormatter/VariableFormatter: Domain logic
 * This replaced a monolithic 415-line formatter with focused modules.
 * @example
 * ```typescript
 * class CustomFormatter extends BaseResponseFormatter {
 *   async debugState(sessionId: string, session: DebugSession) {
 *     const data = { sessionId, state: session.state };
 *     return this.success(data); // Uses inherited success method
 *   }
 *   // ... implement other abstract methods
 * }
 * ```
 * @see file:./debug-response-formatter.ts:24 - Concrete implementation
 * @see file:../types/handlers.ts:32-100 - IResponseFormatter interface
 * @public
 */
export abstract class BaseResponseFormatter implements IResponseFormatter {
  /**
   * Formats successful response data as JSON-serialized MCP tool result.
   * Wraps arbitrary data in the MCP CallToolResult structure with pretty-printed
   * JSON (2-space indentation). Used by all formatter methods to standardize
   * successful response format across the debugger command.
   * @param data - Any serializable data to return to the MCP client
   * @returns MCP-compliant tool result with JSON text content
   * @example
   * ```typescript
   * const result = formatter.success({ sessionId: 'abc123', state: 'paused' });
   * // Returns: { content: [{ type: 'text', text: '{\n  "sessionId": "abc123",\n  "state": "paused"\n}' }] }
   * ```
   * @see file:../types/handlers.ts:183-186 - CallToolResult interface
   * @public
   */
  public success(data: unknown): CallToolResult {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(data, null, 2),
        },
      ],
    };
  }

  /**
   * Formats error response with message and optional diagnostic details.
   * Creates a standardized error response with isError flag set to true,
   * allowing MCP clients to distinguish failures from successful results.
   * The details parameter accepts any additional context (stack traces,
   * error codes, session state) useful for debugging.
   * @param message - Human-readable error message describing what went wrong
   * @param details - Optional diagnostic information (error objects, session state, etc.)
   * @returns MCP-compliant error result with isError flag
   * @example
   * ```typescript
   * // Simple error
   * formatter.error('Session not found');
   * // Error with context
   * formatter.error('Failed to set breakpoint', {
   *   file: '/path/to/script.js',
   *   line: 42,
   *   reason: 'Source file not loaded'
   * });
   * ```
   * @public
   */
  public error(message: string, details?: unknown): CallToolResult {
    const errorData: Record<string, unknown> = { error: message };
    if (details !== undefined) {
      errorData.details = details;
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(errorData, null, 2),
        },
      ],
      isError: true,
    };
  }

  /**
   * Formats debug execution state including breakpoint location and call stack.
   * Provides comprehensive view of paused debug session with stack frames,
   * code origin markers (user/library/internal), and file location details.
   * Implementations must handle both Node.js and browser session formats.
   * @param sessionId - Debug session identifier
   * @param session - Complete session object with state, adapter, and breakpoints
   * @returns Promise resolving to formatted debug state result
   * @see file:./debug-response-formatter.ts:25-31 - Concrete implementation
   * @see file:../types/debug-state.ts:1 - CodeOrigin type definition
   * @public
   */
  public abstract debugState(
    sessionId: string,
    session: DebugSession,
  ): Promise<CallToolResult>;

  /**
   * Formats list of active and mock debug sessions.
   * Provides overview of all running sessions with platform, target, state,
   * and lifecycle metadata. Mock sessions are included separately to distinguish
   * test sessions from real debugging.
   * @param sessions - Array of active debug sessions with state and metadata
   * @param mockSessions - Optional array of mock test sessions
   * @returns Formatted list of all sessions
   * @see file:./debug-response-formatter.ts:33-50 - Concrete implementation
   * @public
   */
  public abstract sessionsList(
    sessions: unknown[],
    mockSessions?: unknown[],
  ): CallToolResult;

  /**
   * Formats console output captured from debug session.
   * Returns filtered and formatted console messages (log, warn, error, etc.)
   * with timestamps and optional search filtering. Used by search_console_output
   * tool to provide searchable debug logs.
   * @param data - Console output data with messages, filters, and counts
   * @returns Formatted console output with filter statistics
   * @see file:./debug-response-formatter.ts:52-67 - Concrete implementation
   * @public
   */
  public abstract consoleOutput(data: unknown): CallToolResult;

  /**
   * Formats response for newly started debug session.
   * Returns confirmation that session initialized successfully with session ID,
   * platform (node/browser), and target (script path or URL). Used immediately
   * after debug tool creates a new session.
   * @param sessionId - Newly created session identifier
   * @param platform - Debug platform ('node' or 'browser')
   * @param target - Script path (Node.js) or URL (browser)
   * @returns Formatted running session confirmation
   * @see file:./debug-response-formatter.ts:69-76 - Concrete implementation
   * @public
   */
  public abstract runningSession(
    sessionId: string,
    platform: string,
    target: string,
  ): CallToolResult;

  /**
   * Formats response for terminated debug session.
   * Returns confirmation that session stopped with termination reason.
   * Called when user explicitly stops debugging or session ends naturally.
   * @param sessionId - Terminated session identifier
   * @param message - Reason for termination (user stop, error, completion)
   * @returns Formatted termination confirmation
   * @see file:./debug-response-formatter.ts:78-81 - Concrete implementation
   * @public
   */
  public abstract terminatedSession(
    sessionId: string,
    message: string,
  ): CallToolResult;

  /**
   * Formats call stack trace from paused debug session.
   * Returns hierarchical stack frames with function names, file locations,
   * line/column numbers, and code origin markers. Implementations handle
   * source map resolution and relative path computation.
   * @param sessionId - Debug session identifier
   * @param session - Session object for accessing adapter state
   * @param stackTrace - Array of stack frames with location and origin info
   * @returns Formatted stack trace with source locations
   * @see file:./debug-response-formatter.ts:83-101 - Concrete implementation
   * @see file:../types/debug-state.ts:1 - CodeOrigin type ('user' | 'internal' | 'library' | 'unknown')
   * @public
   */
  public abstract stackTrace(
    sessionId: string,
    session: DebugSession,
    stackTrace: Array<{
      frameId: number;
      functionName: string;
      file: string;
      line: number;
      column?: number;
      origin?: CodeOrigin;
      relativePath?: string;
    }>,
  ): CallToolResult;

  /**
   * Formats variable inspection results from specific stack frame.
   * Returns nested variable structure for given scope path (e.g., 'locals.user.name').
   * Used by get_variables tool to inspect local variables, closures, and object
   * properties at current breakpoint.
   * @param sessionId - Debug session identifier
   * @param frameId - Stack frame index (0 = current frame)
   * @param data - Variable inspection result with path and nested values
   * @returns Formatted variable tree structure
   * @see file:./debug-response-formatter.ts:103-111 - Concrete implementation
   * @public
   */
  public abstract variables(
    sessionId: string,
    frameId: number,
    data: unknown,
  ): CallToolResult;

  /**
   * Formats expression evaluation result from debug REPL.
   * Returns result of evaluating arbitrary JavaScript expression in debug context.
   * Used by continue tool's evaluate parameter to inspect state or execute
   * code at breakpoint. Includes type information and error details if evaluation fails.
   * @param sessionId - Debug session identifier
   * @param evaluation - Evaluation result with expression, value, type, and optional error
   * @returns Formatted evaluation result or error
   * @example
   * ```typescript
   * // Successful evaluation
   * evaluation('s1', { expression: 'user.name', result: 'Alice', type: 'string' });
   * // Failed evaluation
   * evaluation('s1', { expression: 'undefined.prop', result: null, type: 'undefined', error: 'Cannot read property' });
   * ```
   * @see file:./debug-response-formatter.ts:113-124 - Concrete implementation
   * @public
   */
  public abstract evaluation(
    sessionId: string,
    evaluation: {
      expression?: string;
      result: unknown;
      type: string;
      error?: string;
    },
  ): CallToolResult;
}
