import type {
  ICDPClient,
  Scope,
  Variable,
  EvaluationResult,
} from '../../types/index.js';

/**
 * CDP Scope interface matching the structure from pause events
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
 * CDP Property descriptor from Runtime.getProperties
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
 * Response from Runtime.getProperties
 */
interface CDPGetPropertiesResponse {
  result: CDPPropertyDescriptor[];
  internalProperties?: CDPPropertyDescriptor[];
  privateProperties?: CDPPropertyDescriptor[];
  exceptionDetails?: unknown;
}

/**
 * Response from Runtime.evaluate
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
 * This class extracts scope inspection logic from the strawman implementation
 * and provides a clean interface for debugger adapters.
 */
export class ScopeInspector {
  /**
   * Inspects a scope chain from a CDP pause event and returns structured scope data
   *
   * @param scopeChain - Array of CDP scope objects from callFrame.scopeChain
   * @param cdpClient - CDP client for making Runtime.getProperties calls
   * @returns Promise resolving to array of Scope objects with variables
   */
  async inspectScopes(
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
   * Retrieves variables from an object using its CDP objectId
   *
   * @param objectId - CDP object identifier for Runtime.getProperties
   * @param cdpClient - CDP client for making the request
   * @returns Promise resolving to array of Variable objects
   */
  async getVariables(
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
   * Evaluates an expression in a specific call frame scope
   *
   * @param expression - JavaScript expression to evaluate
   * @param callFrameId - CDP call frame identifier for scoped evaluation
   * @param cdpClient - CDP client for making the request
   * @returns Promise resolving to evaluation result
   */
  async evaluateInScope(
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
   * Maps CDP scope types to our Scope interface types
   *
   * @param cdpType - CDP scope type string
   * @returns Mapped scope type for our Scope interface
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
   * Creates a Variable object from a CDP property descriptor
   *
   * @param prop - CDP property descriptor
   * @returns Variable object or null if property should be skipped
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
   * Extracts the actual value from a CDP value object
   * Handles the various ways CDP can represent values
   *
   * @param cdpValue - CDP value object
   * @returns Extracted JavaScript value
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
