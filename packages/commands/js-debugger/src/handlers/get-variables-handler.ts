import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
  Scope,
  Variable,
} from '../types/index.js';

/**
 * Arguments for retrieving variables from a debug session.
 * @public
 * @see file:./get-variables-handler.ts:20 - GetVariablesHandler implementation
 */
export interface GetVariablesHandlerArgs {
  /** Session identifier from debug or continue operations */
  sessionId: string;
  /** Dot-notation path to variable (e.g., 'user', 'user.profile', 'array.0') */
  path: string;
  /** Stack frame index (defaults to 0 for top frame) */
  frameId?: number;
  /** Maximum traversal depth (defaults to 3) */
  maxDepth?: number;
}

/**
 * MCP tool handler for inspecting variables within paused debug sessions.
 *
 * Retrieves variable values by dot-notation path, navigating nested objects and
 * filtering out global scopes. Enriches values with type metadata and prevents
 * circular references. Truncates large collections (arrays \>100, objects \>50 props).
 * @example
 * ```typescript
 * await handler.handle({
 *   sessionId: 'debug-123',
 *   path: 'user.profile.email',
 *   frameId: 1,
 *   maxDepth: 5
 * }, context);
 * ```
 * @public
 * @see file:../types/handlers.ts:14 - IToolHandler interface
 * @see file:../sessions/session-validator.ts:77 - Session validation
 */
export class GetVariablesHandler
  implements IToolHandler<GetVariablesHandlerArgs>
{
  public readonly name = 'get_variables';

  /**
   * Handles variable retrieval for paused sessions.
   *
   * Validates session state, retrieves non-global scopes, and navigates path to find
   * and enrich the variable. All errors are caught and returned as CallToolResult.
   * @param args - Variable request parameters
   * @param context - Handler context with session manager and formatters
   * @returns MCP-formatted response with variable data or error
   */
  public async handle(
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

      if (!args.path?.trim()) {
        return context.responseFormatter.error(
          'Variable path is required. Provide the dot-notation path using the "path" parameter.',
        );
      }

      const trimmedPath = args.path.trim();
      const frameId = args.frameId ?? 0;
      const maxDepth = args.maxDepth ?? 3;

      // Get the scopes for the specified frame and drop globals to avoid huge payloads
      const scopes = (await session.adapter.getScopes(frameId)).filter(
        (scope) => scope.type !== 'global',
      );

      const result = await this.getVariableByPath(
        scopes,
        trimmedPath,
        maxDepth,
      );

      return context.responseFormatter.variables(args.sessionId, frameId, {
        path: trimmedPath,
        result,
      });
    } catch (error) {
      return context.sessionValidator.createHandlerError(
        args.sessionId,
        error,
        'get_variables',
      );
    }
  }

  /**
   * Resolves variable by dot-notation path through debug scopes.
   *
   * Searches scopes for root variable, then navigates nested properties. Returns first
   * match found (typically local scope). For nested paths, uses simple property access.
   * @param scopes - Debug scopes to search (local, closure, block)
   * @param path - Dot-notation path (e.g., 'user.profile.name')
   * @param maxDepth - Max traversal depth for enrichment
   * @returns Resolution result with found flag, optional value, type, and error message
   */
  private async getVariableByPath(
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
   * Recursively navigates object properties following a path array.
   *
   * Validates each step points to an object before property access.
   * @param currentValue - Current navigation value
   * @param remainingPath - Properties still to navigate
   * @returns Final value and type
   * @throws When accessing property on null/undefined/primitives
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
   * Enriches variable values with type metadata and structured formatting.
   *
   * Handles primitives, special objects (Date, RegExp, Map, Set), arrays, and plain objects.
   * Prevents infinite recursion via depth limit and circular detection. Truncates large
   * collections: arrays greater than 100 items (show 50), objects greater than 50 props (show 50), Map/Set (show 20).
   * Uses string representation for circular detection (simple, safe, may have false positives).
   * @param value - Value to enrich
   * @param type - Type hint from debugger
   * @param maxDepth - Max recursion depth
   * @param visitedObjects - Circular reference tracker
   * @param currentDepth - Current recursion level (default: 0)
   * @returns Enriched value with type info or truncation markers
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

  /**
   * Formats primitive values with appropriate string representations.
   *
   * Handles symbols, functions, and bigints with special formatting. Other primitives
   * (string, number, boolean, undefined) returned as-is.
   * @param value - Primitive value to format
   * @param type - Type string from debugger
   * @returns Formatted value for JSON serialization
   */
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
