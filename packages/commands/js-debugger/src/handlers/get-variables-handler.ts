import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
  Scope,
  Variable,
} from '../types.js';

export interface GetVariablesHandlerArgs {
  sessionId: string;
  path?: string;
  frameId?: number;
  maxDepth?: number;
}

/**
 * Handler for getting variables from debug sessions
 * Implements the IToolHandler SEAM for modular tool handling
 */
export class GetVariablesHandler
  implements IToolHandler<GetVariablesHandlerArgs>
{
  readonly name = 'get_variables';

  async handle(
    args: GetVariablesHandlerArgs,
    context: ToolHandlerContext,
  ): Promise<CallToolResult> {
    try {
      // First, check for mock session
      if (context.mockSessionManager?.getMockSession(args.sessionId)) {
        return context.mockSessionManager.getVariablesMock(args);
      }

      // Validate real session exists and is paused
      const validation = context.sessionValidator.validatePausedSession(
        args.sessionId,
      );
      if ('error' in validation) {
        return validation.error;
      }

      const { session } = validation;

      const frameId = args.frameId ?? 0;
      const maxDepth = args.maxDepth ?? 3;

      // Get the scopes for the specified frame
      const scopes = await session.adapter.getScopes(frameId);

      if (args.path) {
        // Path-based variable access
        const result = await this.getVariableByPath(
          session,
          scopes,
          args.path,
          maxDepth,
        );
        return context.responseFormatter.variables(args.sessionId, frameId, {
          path: args.path,
          result,
        });
      } else {
        // Get all variables in all scopes
        const enrichedScopes = await Promise.all(
          scopes.map(async (scope) => ({
            type: scope.type,
            name: scope.name,
            variables: await Promise.all(
              scope.variables.map(async (variable) => ({
                name: variable.name,
                value: await this.enrichVariableValue(
                  variable.value,
                  variable.type,
                  maxDepth,
                  new Set(),
                ),
                type: variable.type,
                configurable: variable.configurable,
                enumerable: variable.enumerable,
              })),
            ),
          })),
        );

        return context.responseFormatter.variables(args.sessionId, frameId, {
          maxDepth,
          scopes: enrichedScopes,
        });
      }
    } catch (error) {
      return context.sessionValidator.createHandlerError(
        args.sessionId,
        error,
        'get_variables',
      );
    }
  }

  /**
   * Get variable by dot-notation path
   */
  private async getVariableByPath(
    session: any,
    scopes: Scope[],
    path: string,
    maxDepth: number,
  ): Promise<{
    found: boolean;
    value?: unknown;
    type?: string;
    error?: string;
  }> {
    const pathParts = path.split('.');
    const rootVariableName = pathParts[0];

    // Find the root variable in any scope
    let rootVariable: Variable | undefined;

    for (const scope of scopes) {
      rootVariable = scope.variables.find(
        (v: Variable) => v.name === rootVariableName,
      );
      if (rootVariable) {
        break;
      }
    }

    if (!rootVariable) {
      return {
        found: false,
        error: `Variable '${rootVariableName}' not found in any scope`,
      };
    }

    // If it's just the root variable, return it enriched
    if (pathParts.length === 1) {
      const enrichedValue = await this.enrichVariableValue(
        rootVariable.value,
        rootVariable.type,
        maxDepth,
        new Set(),
      );
      return {
        found: true,
        value: enrichedValue,
        type: rootVariable.type,
      };
    }

    // For deeper paths, we would need CDP-based navigation
    // For now, return a simple implementation
    try {
      const result = this.navigateSimplePath(
        rootVariable.value,
        pathParts.slice(1),
      );
      return {
        found: true,
        value: result.value,
        type: result.type,
      };
    } catch (error) {
      return {
        found: false,
        error: `Error navigating path '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Simple path navigation for basic objects
   */
  private navigateSimplePath(
    currentValue: unknown,
    remainingPath: string[],
  ): { value: unknown; type: string } {
    if (remainingPath.length === 0) {
      return { value: currentValue, type: typeof currentValue };
    }

    if (typeof currentValue !== 'object' || currentValue === null) {
      throw new Error(
        `Cannot navigate property '${remainingPath[0]}' on non-object type '${typeof currentValue}'`,
      );
    }

    const nextPart = remainingPath[0];
    const nextValue = (currentValue as Record<string, unknown>)[nextPart];

    return this.navigateSimplePath(nextValue, remainingPath.slice(1));
  }

  /**
   * Enrich variable value with type information and structure
   */
  private async enrichVariableValue(
    value: unknown,
    type: string,
    maxDepth: number,
    visitedObjects: Set<string>,
    currentDepth = 0,
  ): Promise<unknown> {
    // Prevent infinite recursion
    if (currentDepth >= maxDepth) {
      return `[Max depth ${maxDepth} reached]`;
    }

    // Handle primitive types
    if (type !== 'object' || value === null || value === undefined) {
      return this.formatPrimitiveValue(value, type);
    }

    // Handle circular references (simplified)
    const valueString = String(value);
    if (visitedObjects.has(valueString)) {
      return '[Circular]';
    }
    visitedObjects.add(valueString);

    // Handle arrays
    if (Array.isArray(value)) {
      if (value.length > 100) {
        return `[Array with ${value.length} items - too large to display]`;
      }

      return await Promise.all(
        value.slice(0, 50).map(async (item, index) => ({
          index: String(index),
          value: await this.enrichVariableValue(
            item,
            typeof item,
            maxDepth,
            new Set(visitedObjects),
            currentDepth + 1,
          ),
        })),
      );
    }

    // Handle special object types
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() };
    }

    if (value instanceof RegExp) {
      return { __type: 'RegExp', value: value.toString() };
    }

    if (value instanceof Map) {
      return {
        __type: 'Map',
        size: value.size,
        entries: Array.from(value.entries()).slice(0, 20),
      };
    }

    if (value instanceof Set) {
      return {
        __type: 'Set',
        size: value.size,
        values: Array.from(value.values()).slice(0, 20),
      };
    }

    // Handle plain objects
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      const result: Record<string, unknown> = {};
      const maxProps = 50;
      const keysToProcess = keys.slice(0, maxProps);

      for (const key of keysToProcess) {
        try {
          const propValue = (value as Record<string, unknown>)[key];
          result[key] = await this.enrichVariableValue(
            propValue,
            typeof propValue,
            maxDepth,
            new Set(visitedObjects),
            currentDepth + 1,
          );
        } catch (error) {
          result[key] =
            `[Error: ${error instanceof Error ? error.message : 'Unknown error'}]`;
        }
      }

      if (keys.length > maxProps) {
        result['...'] = `[${keys.length - maxProps} more properties]`;
      }

      return result;
    }

    return value;
  }

  private formatPrimitiveValue(value: unknown, type: string): unknown {
    switch (type) {
      case 'string':
      case 'number':
      case 'boolean':
        return value;
      case 'undefined':
        return undefined;
      case 'symbol':
        return `[Symbol: ${String(value)}]`;
      case 'function':
        return `[Function: ${String(value)}]`;
      case 'bigint':
        return `${String(value)}n`;
      default:
        return value;
    }
  }
}
