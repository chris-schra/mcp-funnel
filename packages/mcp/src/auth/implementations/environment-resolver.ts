/**
 * Environment Variable Resolver for OAuth configurations
 *
 * Securely resolves environment variables in auth configurations with support for:
 * - Pattern: ${ENV_VAR_NAME} or ${ENV_VAR_NAME:default_value}
 * - Nested resolution support
 * - Security: Prevent circular references and injection attacks
 * - Proper error handling for missing variables
 */

/**
 * Configuration for environment variable resolution
 */
export interface EnvironmentResolverConfig {
  /** Maximum depth for nested variable resolution (prevents infinite loops) */
  maxDepth?: number;
  /** Whether to throw on missing variables without defaults */
  strict?: boolean;
  /** Custom environment source (defaults to process.env) */
  envSource?: Record<string, string | undefined>;
}

/**
 * Error thrown when environment variable resolution fails
 */
export class EnvironmentResolutionError extends Error {
  constructor(
    message: string,
    public readonly variable?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'EnvironmentResolutionError';
    Object.setPrototypeOf(this, EnvironmentResolutionError.prototype);
  }

  static missingVariable(variable: string): EnvironmentResolutionError {
    return new EnvironmentResolutionError(
      `Required environment variable '${variable}' is not defined`,
      variable,
    );
  }

  static circularReference(variable: string): EnvironmentResolutionError {
    return new EnvironmentResolutionError(
      `Circular reference detected in environment variable '${variable}'`,
      variable,
    );
  }

  static maxDepthExceeded(depth: number): EnvironmentResolutionError {
    return new EnvironmentResolutionError(
      `Maximum resolution depth of ${depth} exceeded`,
    );
  }

  static invalidPattern(pattern: string): EnvironmentResolutionError {
    return new EnvironmentResolutionError(
      `Invalid environment variable pattern: ${pattern}`,
    );
  }
}

/**
 * Environment variable resolver with security protections
 */
export class EnvironmentResolver {
  private readonly maxDepth: number;
  private readonly strict: boolean;
  private readonly envSource: Record<string, string | undefined>;

  constructor(config: EnvironmentResolverConfig = {}) {
    this.maxDepth = config.maxDepth ?? 10;
    this.strict = config.strict ?? true;
    this.envSource = config.envSource ?? process.env;
  }

  /**
   * Resolves environment variables in a string value
   *
   * @param value - String containing environment variable patterns
   * @param visitedVars - Set of variables being resolved (for circular detection)
   * @param depth - Current resolution depth
   * @returns Resolved string value
   */
  resolve(
    value: string,
    visitedVars: Set<string> = new Set(),
    depth: number = 0,
  ): string {
    if (depth > this.maxDepth) {
      throw EnvironmentResolutionError.maxDepthExceeded(this.maxDepth);
    }

    // Pattern: ${VAR_NAME} or ${VAR_NAME:default_value}
    const envPattern = /\$\{([A-Z_][A-Z0-9_]*)(?::([^}]*))?\}/gi;

    return value.replace(
      envPattern,
      (match, varName: string, defaultValue?: string) => {
        // Security: Validate variable name to prevent injection
        if (!this.isValidVariableName(varName)) {
          throw EnvironmentResolutionError.invalidPattern(match);
        }

        // Security: Check for circular references
        if (visitedVars.has(varName)) {
          throw EnvironmentResolutionError.circularReference(varName);
        }

        // Get environment variable value
        const envValue = this.envSource[varName];

        if (envValue === undefined) {
          if (defaultValue !== undefined) {
            // Recursively resolve default value
            const newVisited = new Set(visitedVars);
            newVisited.add(varName);
            return this.resolve(defaultValue, newVisited, depth + 1);
          } else if (this.strict) {
            throw EnvironmentResolutionError.missingVariable(varName);
          } else {
            return match; // Return original pattern if not strict
          }
        }

        // Recursively resolve the environment variable value
        const newVisited = new Set(visitedVars);
        newVisited.add(varName);
        return this.resolve(envValue, newVisited, depth + 1);
      },
    );
  }

  /**
   * Resolves environment variables in an object configuration
   *
   * @param config - Configuration object with potential environment variables
   * @returns Configuration with resolved environment variables
   */
  resolveObject<T extends Record<string, unknown>>(config: T): T {
    const resolved = {} as T;

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string') {
        resolved[key as keyof T] = this.resolve(value) as T[keyof T];
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        // Recursively resolve nested objects
        resolved[key as keyof T] = this.resolveObject(
          value as Record<string, unknown>,
        ) as T[keyof T];
      } else {
        // Copy non-string values as-is
        resolved[key as keyof T] = value as T[keyof T];
      }
    }

    return resolved;
  }

  /**
   * Validates that a variable name follows secure naming conventions
   *
   * @param varName - Variable name to validate
   * @returns true if valid, false otherwise
   */
  private isValidVariableName(varName: string): boolean {
    // Allow only uppercase letters, numbers, and underscores
    // Must start with letter or underscore
    return /^[A-Z_][A-Z0-9_]*$/.test(varName);
  }

  /**
   * Utility method to check if a string contains environment variable patterns
   */
  static containsVariables(value: string): boolean {
    return /\$\{[A-Z_][A-Z0-9_]*(?::[^}]*)?\}/i.test(value);
  }
}

/**
 * Convenience function to resolve environment variables in a string
 */
export function resolveEnvironmentVariables(
  value: string,
  config?: EnvironmentResolverConfig,
): string {
  const resolver = new EnvironmentResolver(config);
  return resolver.resolve(value);
}
