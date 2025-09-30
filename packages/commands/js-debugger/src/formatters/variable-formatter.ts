/**
 * Variable inspection and evaluation formatting utilities
 *
 * Handles formatting for:
 * - Variable inspection responses
 * - Expression evaluation results
 * - Debug context data presentation
 * @see file:./debug-response-formatter.ts:109 - Variables method usage
 * @see file:./debug-response-formatter.ts:122 - Evaluation method usage
 * @public
 */
export class VariableFormatter {
  /**
   * Format variable inspection response into a structured result object.
   * Wraps variable inspection data with session context and a descriptive message
   * for display to the user. The result object includes the session ID, frame ID,
   * the variable path that was queried, and the inspection result.
   * @param {string} sessionId - Debug session identifier
   * @param {number} frameId - Stack frame identifier (0 = top frame)
   * @param {{ path: string; result: unknown }} data - Variable inspection data
   * @param {string} data.path - Dot-notation path to the variable (e.g., "user.profile.name")
   * @param {unknown} data.result - Variable inspection result from the debugger
   * @returns {Record<string, unknown>} Structured response object with session context and variable data
   * @see file:../handlers/get-variables-handler.ts:66 - Caller that uses this formatter
   * @public
   */
  public static variables(
    sessionId: string,
    frameId: number,
    data: { path: string; result: unknown },
  ): Record<string, unknown> {
    return {
      sessionId,
      frameId,
      path: data.path,
      result: data.result,
      message: `Variable inspection for path: ${data.path}`,
    };
  }

  /**
   * Format expression evaluation result from a paused debug session.
   * Wraps the evaluation result with session context and status information.
   * The session remains paused after evaluation completes, allowing further
   * inspection or stepping operations.
   * @param {string} sessionId - Debug session identifier
   * @param {{ expression?: string; result: unknown; type: string; error?: string }} evaluation - Evaluation result data
   * @param {string | undefined} evaluation.expression - Expression that was evaluated (if available)
   * @param {unknown} evaluation.result - Evaluation result value
   * @param {string} evaluation.type - Type of the result (e.g., "string", "object")
   * @param {string | undefined} evaluation.error - Error message if evaluation failed
   * @returns {Record<string, unknown>} Structured response indicating evaluation completed while session remains paused
   * @see file:./debug-response-formatter.ts:122 - Usage in response formatter
   * @public
   */
  public static evaluation(
    sessionId: string,
    evaluation: {
      expression?: string;
      result: unknown;
      type: string;
      error?: string;
    },
  ): Record<string, unknown> {
    return {
      sessionId,
      evaluation,
      status: 'paused',
      message: 'Evaluation complete. Session still paused.',
    };
  }

  /**
   * Format variable data with depth limiting and optional type annotations.
   * Recursively formats variable data structures while preventing infinite recursion
   * through depth limiting. Can optionally annotate values with runtime type information.
   * Arrays and objects are traversed recursively up to maxDepth.
   *
   * NOTE: This method is currently unused in the codebase but provides utility formatting
   * that may be needed for future variable display features.
   * @param {Record<string, unknown>} variables - Variable data to format
   * @param {{ maxDepth?: number; includeTypes?: boolean }} options - Formatting options
   * @param {number | undefined} options.maxDepth - Maximum recursion depth (default: 3)
   * @param {boolean | undefined} options.includeTypes - Whether to add __type annotations to objects (default: false)
   * @returns {Record<string, unknown>} Formatted variable data with depth limits applied
   * @internal
   */
  public static formatVariableData(
    variables: Record<string, unknown>,
    options: {
      maxDepth?: number;
      includeTypes?: boolean;
    } = {},
  ): Record<string, unknown> {
    const { maxDepth = 3, includeTypes = false } = options;

    const formatValue = (value: unknown, depth: number): unknown => {
      if (depth >= maxDepth) {
        return '[max depth reached]';
      }

      if (value === null || value === undefined) {
        return value;
      }

      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          return value.map((item) => formatValue(item, depth + 1));
        }

        const formatted: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
          formatted[key] = formatValue(val, depth + 1);
        }

        if (includeTypes) {
          formatted.__type = 'object';
        }

        return formatted;
      }

      if (includeTypes) {
        return {
          value,
          type: typeof value,
        };
      }

      return value;
    };

    return formatValue(variables, 0) as Record<string, unknown>;
  }

  /**
   * Format scope variables from debug context into a structured display object.
   * Transforms scope arrays (local, closure, block, etc.) into a keyed object
   * where each scope type maps to its variables. Global scope is intentionally
   * omitted to reduce payload size and noise in debug output.
   *
   * NOTE: This method is currently unused in the codebase but provides formatting
   * functionality that may be needed for comprehensive scope visualization features.
   * Global scope is filtered out to avoid overwhelming output with built-in globals.
   * @param {Array<{ type: string; variables: Array<{ name: string; value: unknown; type?: string }> }>} scopes - Array of scope objects from debugger
   * @param {string} scopes[].type - Scope type (e.g., "local", "closure", "block")
   * @param {Array<{ name: string; value: unknown; type?: string }>} scopes[].variables - Variables within this scope
   * @returns {Record<string, unknown>} Formatted object with scope types as keys and variable maps as values
   * @internal
   */
  public static formatScopeVariables(
    scopes: Array<{
      type: string;
      variables: Array<{ name: string; value: unknown; type?: string }>;
    }>,
  ): Record<string, unknown> {
    const formatted: Record<string, unknown> = {};

    for (const scope of scopes) {
      if (scope.type === 'global') {
        continue; // Skip global scope to reduce noise
      }

      formatted[scope.type] = Object.fromEntries(
        scope.variables.map((variable) => [
          variable.name,
          {
            value: variable.value,
            type: variable.type,
          },
        ]),
      );
    }

    return formatted;
  }

  /**
   * Format error information for failed expression evaluations.
   * Creates a structured error response when expression evaluation fails in a paused
   * debug session. Normalizes both string and Error object inputs into a consistent
   * format. The session remains paused after the evaluation error.
   *
   * NOTE: This method is currently unused in the codebase but provides error formatting
   * that would be needed if evaluation error handling is implemented separately
   * from the main evaluation formatter.
   * @param {string} sessionId - Debug session identifier
   * @param {string} expression - Expression that failed to evaluate
   * @param {string | Error} error - Error message or Error object from the failed evaluation
   * @returns {Record<string, unknown>} Structured error response with session context and error details
   * @internal
   */
  public static formatEvaluationError(
    sessionId: string,
    expression: string,
    error: string | Error,
  ): Record<string, unknown> {
    return {
      sessionId,
      evaluation: {
        expression,
        error: typeof error === 'string' ? error : error.message,
        result: null,
        type: 'error',
      },
      status: 'paused',
      message: 'Evaluation failed. Session still paused.',
    };
  }
}
