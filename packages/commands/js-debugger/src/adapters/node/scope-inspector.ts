import type {
  ICDPClient,
  Scope,
  Variable,
  EvaluationResult,
} from '../../types/index.js';

/**
 * CDP Scope interface matching the structure from pause events.
 *
 * Represents the raw scope chain structure returned by Chrome DevTools Protocol
 * when the debugger pauses execution. Each scope contains an object reference
 * and metadata about the scope's location in the source code.
 * @internal
 * @see file:../../types/evaluation.ts:13 - Public Scope interface
 */
interface CDPScope {
  type:
    | 'global'
    | 'local'
    | 'closure'
    | 'module'
    | 'with'
    | 'catch'
    | 'block'
    | 'script'
    | 'eval';
  object: {
    objectId?: string;
    type: string;
    className?: string;
    description?: string;
    value?: unknown;
  };
  name?: string;
  startLocation?: {
    scriptId: string;
    lineNumber: number;
    columnNumber: number;
  };
  endLocation?: {
    scriptId: string;
    lineNumber: number;
    columnNumber: number;
  };
}

/**
 * CDP Property descriptor from Runtime.getProperties.
 *
 * Represents a single property descriptor returned by the CDP Runtime.getProperties
 * command, including metadata about configurability, enumerability, and accessor functions.
 * @internal
 */
interface CDPPropertyDescriptor {
  name: string;
  value?: {
    type: string;
    value?: unknown;
    description?: string;
    objectId?: string;
    className?: string;
  };
  writable?: boolean;
  get?: {
    type: string;
    objectId?: string;
  };
  set?: {
    type: string;
    objectId?: string;
  };
  configurable?: boolean;
  enumerable?: boolean;
  wasThrown?: boolean;
  isOwn?: boolean;
  symbol?: {
    type: string;
    description?: string;
    objectId?: string;
  };
}

/**
 * Response from Runtime.getProperties.
 *
 * Contains all properties (regular, internal, and private) of an object
 * along with any exception details if the operation failed.
 * @internal
 */
interface CDPGetPropertiesResponse {
  result: CDPPropertyDescriptor[];
  internalProperties?: CDPPropertyDescriptor[];
  privateProperties?: CDPPropertyDescriptor[];
  exceptionDetails?: unknown;
}

/**
 * Response from Debugger.evaluateOnCallFrame.
 *
 * Contains the evaluation result along with any exception details or error indicators.
 * Note: Despite the interface name, this is used for evaluateOnCallFrame, not Runtime.evaluate.
 * @internal
 */
interface CDPEvaluateResponse {
  result: {
    type: string;
    value?: unknown;
    description?: string;
    objectId?: string;
    className?: string;
  };
  exceptionDetails?: {
    exceptionId: number;
    text: string;
    lineNumber: number;
    columnNumber: number;
    scriptId?: string;
    url?: string;
    stackTrace?: unknown;
    exception?: unknown;
  };
  wasThrown?: boolean;
}

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
   * @param {CDPScope[]} scopeChain - Array of CDP scope objects from callFrame.scopeChain
   * @param {ICDPClient} cdpClient - CDP client for making Runtime.getProperties calls
   * @returns {Promise<Scope[]>} Promise resolving to array of Scope objects with populated variables
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
      const scopeType = this.mapScopeType(cdpScope.type);

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
   * @param {string} objectId - CDP object identifier from scope.object.objectId
   * @param {ICDPClient} cdpClient - CDP client for making the Runtime.getProperties request
   * @returns {Promise<Variable[]>} Promise resolving to array of Variable objects
   * @throws {Error} When the CDP Runtime.getProperties request fails - wraps the
   *                 underlying CDP error with context about which objectId failed
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

          const variable = this.createVariableFromProperty(prop);
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
   * @param {string} expression - JavaScript expression to evaluate (e.g., 'users.length', 'x + y')
   * @param {string} callFrameId - CDP call frame identifier from the current pause event
   * @param {ICDPClient} cdpClient - CDP client for making the Debugger.evaluateOnCallFrame request
   * @returns {Promise<EvaluationResult>} Promise resolving to evaluation result - never rejects, errors returned as type='error'
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
        value: this.extractValue(result),
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

  /**
   * Maps CDP scope types to our Scope interface types.
   *
   * CDP supports more granular scope types (module, script, eval, block) than
   * our public Scope interface. These are mapped to their closest equivalent,
   * with less common types defaulting to 'local'.
   * @param {CDPScope['type']} cdpType - CDP scope type from callFrame.scopeChain[].type
   * @returns {Scope['type']} Mapped scope type matching Scope['type'] union
   * @internal
   */
  private mapScopeType(cdpType: CDPScope['type']): Scope['type'] {
    switch (cdpType) {
      case 'global':
        return 'global';
      case 'local':
        return 'local';
      case 'closure':
        return 'closure';
      case 'with':
        return 'with';
      case 'catch':
        return 'catch';
      // Map less common CDP types to closest equivalent
      case 'module':
      case 'script':
      case 'eval':
      case 'block':
        return 'local'; // Treat as local scope
      default:
        return 'local'; // Default fallback
    }
  }

  /**
   * Creates a Variable object from a CDP property descriptor.
   *
   * Filters out properties that shouldn't be shown as variables:
   * - Getters/setters without resolved values
   * - Properties that threw exceptions during access
   * - Properties without value descriptors
   * @param {CDPPropertyDescriptor} prop - CDP property descriptor from Runtime.getProperties result
   * @returns {Variable | null} Variable object or null if property should be filtered out
   * @internal
   */
  private createVariableFromProperty(
    prop: CDPPropertyDescriptor,
  ): Variable | null {
    // Skip getters/setters without values
    if (!prop.value && (prop.get || prop.set)) {
      return null;
    }

    // Skip properties that threw during access
    if (prop.wasThrown) {
      return null;
    }

    const value = prop.value;
    if (!value) {
      return null;
    }

    return {
      name: prop.name,
      value: this.extractValue(value),
      type: value.type,
      configurable: prop.configurable,
      enumerable: prop.enumerable,
    };
  }

  /**
   * Extracts the actual value from a CDP value object.
   *
   * CDP represents values differently depending on their type:
   * - Primitives (string, number, boolean, undefined): value field contains the actual value
   * - null: Special case with type='object' and value=null
   * - Complex objects with objectId: Returns description string (full object inspection requires separate call)
   * - Simple objects without objectId: Returns value or description
   * @param {{type: string, value?: unknown, description?: string, objectId?: string, className?: string}} cdpValue - CDP value object from property descriptors or evaluation results
   * @param {string} cdpValue.type - Value type
   * @param {unknown} [cdpValue.value] - Actual value for primitives
   * @param {string} [cdpValue.description] - Description string for complex types
   * @param {string} [cdpValue.objectId] - Object ID for further inspection
   * @param {string} [cdpValue.className] - Class name for objects
   * @returns {unknown} Extracted JavaScript value - primitives as-is, complex objects as description strings
   * @internal
   */
  private extractValue(cdpValue: {
    type: string;
    value?: unknown;
    description?: string;
    objectId?: string;
    className?: string;
  }): unknown {
    // For primitive types, use the value directly
    if (
      cdpValue.type === 'string' ||
      cdpValue.type === 'number' ||
      cdpValue.type === 'boolean' ||
      cdpValue.type === 'undefined'
    ) {
      return cdpValue.value;
    }

    // For null, return null regardless of the value field
    if (cdpValue.type === 'object' && cdpValue.value === null) {
      return null;
    }

    // For objects without objectId, use description or value
    if (cdpValue.type === 'object' && !cdpValue.objectId) {
      return cdpValue.value ?? cdpValue.description ?? '[Object]';
    }

    // For complex objects, arrays, functions, etc., use description
    // The objectId would be used for further inspection if needed
    if (cdpValue.objectId) {
      return cdpValue.description || `[${cdpValue.className || cdpValue.type}]`;
    }

    // Fallback to value or description
    return cdpValue.value ?? cdpValue.description ?? `[${cdpValue.type}]`;
  }
}
