import type {
  ICDPClient,
  Scope,
  Variable,
  EvaluationResult,
} from '../../types/index.js';
import type {
  CDPScope,
  CDPGetPropertiesResponse,
  CDPEvaluateResponse,
} from './scope-inspector-types.js';
import {
  mapScopeType,
  extractValue,
  createVariableFromProperty,
} from './scope-inspector-utils.js';

/**
 * ScopeInspector handles scope chain inspection and variable retrieval
 * using Chrome DevTools Protocol (CDP) Runtime domain.
 *
 * This class provides the core logic for inspecting JavaScript execution contexts,
 * extracting variables from scope chains, and evaluating expressions within
 * specific call frames during debugging sessions.
 *
 * Key capabilities:
 * - Converts CDP scope chains to structured Scope objects
 * - Retrieves all variables from a scope's object reference
 * - Evaluates JavaScript expressions in call frame contexts
 * - Handles primitive and complex value extraction from CDP
 * @example Basic scope inspection
 * ```typescript
 * const inspector = new ScopeInspector();
 * const scopes = await inspector.inspectScopes(callFrame.scopeChain, cdpClient);
 * console.log(`Found ${scopes.length} scopes`);
 * scopes[0].variables.forEach(v => console.log(`${v.name}: ${v.value}`));
 * ```
 * @example Expression evaluation in scope
 * ```typescript
 * const result = await inspector.evaluateInScope(
 *   'users.length',
 *   callFrameId,
 *   cdpClient
 * );
 * if (result.type !== 'error') {
 *   console.log(`Result: ${result.value}`);
 * }
 * ```
 * @public
 * @see file:../../types/evaluation.ts:13 - Scope and Variable types
 * @see file:../node-adapter.ts:515 - Usage in NodeDebugAdapter
 */
export class ScopeInspector {
  /**
   * Inspects a scope chain from a CDP pause event and returns structured scope data.
   *
   * Converts the raw CDP scope chain (from a paused call frame) into our Scope format,
   * retrieving all variables for each scope that has an objectId. Scopes without objectIds
   * (rare edge cases) will have empty variable arrays.
   *
   * Variable retrieval failures are logged but don't halt processing - the scope will
   * simply have an empty variables array rather than throwing an error.
   * @param scopeChain - Array of CDP scope objects from callFrame.scopeChain
   * @param cdpClient - CDP client for making Runtime.getProperties calls
   * @returns Promise resolving to array of Scope objects with populated variables
   * @example
   * ```typescript
   * // Called from NodeDebugAdapter.getScopes()
   * const frame = this.currentCallFrames[frameId];
   * const scopes = await this.scopeInspector.inspectScopes(
   *   frame.scopeChain,
   *   this.cdpClient
   * );
   * ```
   * @public
   * @see file:../node-adapter.ts:515 - Primary call site
   * @see file:../../types/evaluation.ts:13 - Scope interface
   */
  public async inspectScopes(
    scopeChain: CDPScope[],
    cdpClient: ICDPClient,
  ): Promise<Scope[]> {
    const scopes: Scope[] = [];

    for (const cdpScope of scopeChain) {
      // Map CDP scope types to our type system
      const scopeType = mapScopeType(cdpScope.type);

      const scope: Scope = {
        type: scopeType,
        name: cdpScope.name,
        variables: [],
      };

      // Only inspect scopes that have an objectId for property retrieval
      if (cdpScope.object.objectId) {
        try {
          scope.variables = await this.getVariables(
            cdpScope.object.objectId,
            cdpClient,
          );
        } catch (error) {
          // Log error but continue with empty variables
          console.warn(
            `Failed to get variables for ${scopeType} scope:`,
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      scopes.push(scope);
    }

    return scopes;
  }

  /**
   * Retrieves variables from an object using its CDP objectId.
   *
   * Makes a Runtime.getProperties call to fetch all own properties of the object
   * identified by objectId. Filters out internal properties (those starting with '__'),
   * getters/setters without values, and properties that threw during access.
   * @param objectId - CDP object identifier from scope.object.objectId
   * @param cdpClient - CDP client for making the Runtime.getProperties request
   * @returns Promise resolving to array of Variable objects
   * @throws When the CDP Runtime.getProperties request fails - wraps the
   *         underlying CDP error with context about which objectId failed
   * @public
   * @see file:../../types/evaluation.ts:19 - Variable interface
   */
  public async getVariables(
    objectId: string,
    cdpClient: ICDPClient,
  ): Promise<Variable[]> {
    try {
      const response = await cdpClient.send<CDPGetPropertiesResponse>(
        'Runtime.getProperties',
        {
          objectId,
          ownProperties: true,
          accessorPropertiesOnly: false,
          generatePreview: false,
        },
      );

      const variables: Variable[] = [];

      // Process regular properties
      if (response.result) {
        for (const prop of response.result) {
          // Skip internal properties (those starting with __)
          if (prop.name.startsWith('__')) {
            continue;
          }

          const variable = createVariableFromProperty(prop);
          if (variable) {
            variables.push(variable);
          }
        }
      }

      return variables;
    } catch (error) {
      throw new Error(
        `Failed to get properties for objectId ${objectId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Evaluates a JavaScript expression in a specific call frame scope.
   *
   * Uses Debugger.evaluateOnCallFrame to evaluate the expression with access to
   * all variables in the call frame's scope chain. This enables inspecting local
   * variables, accessing closures, and computing derived values during debugging.
   *
   * If the expression throws an exception or encounters evaluation errors, returns
   * an EvaluationResult with type='error' rather than throwing - this allows
   * callers to handle evaluation failures gracefully.
   * @param expression - JavaScript expression to evaluate (e.g., 'users.length', 'x + y')
   * @param callFrameId - CDP call frame identifier from the current pause event
   * @param cdpClient - CDP client for making the Debugger.evaluateOnCallFrame request
   * @returns Promise resolving to evaluation result - never rejects, errors returned as type='error'
   * @example
   * ```typescript
   * // Evaluate complex expression in current scope
   * const result = await inspector.evaluateInScope(
   *   'users.filter(u => u.active).map(u => u.name)',
   *   callFrameId,
   *   cdpClient
   * );
   * if (result.type !== 'error') {
   *   console.log('Active users:', result.value);
   * }
   * ```
   * @public
   * @see file:../node-adapter.ts:413 - Primary call site
   * @see file:../../types/evaluation.ts:27 - EvaluationResult interface
   */
  public async evaluateInScope(
    expression: string,
    callFrameId: string,
    cdpClient: ICDPClient,
  ): Promise<EvaluationResult> {
    try {
      const response = await cdpClient.send<CDPEvaluateResponse>(
        'Debugger.evaluateOnCallFrame',
        {
          callFrameId,
          expression,
          objectGroup: 'scope-inspector',
          includeCommandLineAPI: false,
          silent: false,
          returnByValue: false,
          generatePreview: false,
          throwOnSideEffect: false,
        },
      );

      if (response.exceptionDetails || response.wasThrown) {
        return {
          value: undefined,
          type: 'error',
          error:
            response.exceptionDetails?.text || 'Evaluation threw an exception',
          description: response.exceptionDetails?.text,
        };
      }

      const result = response.result;
      return {
        value: extractValue(result),
        type: result.type,
        description: result.description,
      };
    } catch (error) {
      return {
        value: undefined,
        type: 'error',
        error: `Evaluation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      };
    }
  }
}
