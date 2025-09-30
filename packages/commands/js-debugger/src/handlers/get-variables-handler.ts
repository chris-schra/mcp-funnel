import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
  Scope,
  Variable,
} from '../types/index.js';
import {
  enrichVariableValue,
  navigateSimplePath,
} from '../utils/variable-enrichment.js';

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
  public readonly name = 'get_variables';

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

      const frameId = args.frameId ?? 0;
      const maxDepth = args.maxDepth ?? 3;

      // Get the scopes for the specified frame
      const scopes = await session.adapter.getScopes(frameId);

      if (args.path) {
        // Path-based variable access
        const result = await this.getVariableByPath(
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
                value: await enrichVariableValue(
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
      const enrichedValue = await enrichVariableValue(
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
      const result = navigateSimplePath(rootVariable.value, pathParts.slice(1));
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
}
