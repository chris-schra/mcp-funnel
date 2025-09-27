/**
 * Variable inspection and evaluation formatting utilities
 *
 * Handles formatting for:
 * - Variable inspection responses
 * - Expression evaluation results
 * - Debug context data presentation
 */
export class VariableFormatter {
  /**
   * Format variable inspection response
   */
  static variables(
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
   * Format evaluation result
   */
  static evaluation(
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
   * Format variable data with proper type information
   */
  static formatVariableData(
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
   * Format scope variables for display
   */
  static formatScopeVariables(
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
   * Format error information for failed evaluations
   */
  static formatEvaluationError(
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
