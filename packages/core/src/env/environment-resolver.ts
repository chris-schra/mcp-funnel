import type { EnvVarPatternResolverConfig } from '@mcp-funnel/models';

/**
 * Error thrown when environment variable resolution fails.
 *
 * Provides specific error types for different failure modes including
 * missing variables, circular references, and depth limit violations.
 * @public
 */
export class EnvironmentResolutionError extends Error {
  public constructor(
    message: string,
    public readonly variable?: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'EnvironmentResolutionError';
    Object.setPrototypeOf(this, EnvironmentResolutionError.prototype);
  }

  public static missingVariable(variable: string): EnvironmentResolutionError {
    return new EnvironmentResolutionError(
      `Required environment variable '${variable}' is not defined`,
      variable,
    );
  }

  public static circularReference(
    variable: string,
  ): EnvironmentResolutionError {
    return new EnvironmentResolutionError(
      `Circular reference detected in environment variable '${variable}'`,
      variable,
    );
  }

  public static maxDepthExceeded(depth: number): EnvironmentResolutionError {
    return new EnvironmentResolutionError(
      `Maximum resolution depth of ${depth} exceeded`,
    );
  }

  public static invalidPattern(pattern: string): EnvironmentResolutionError {
    return new EnvironmentResolutionError(
      `Invalid environment variable pattern: ${pattern}`,
    );
  }
}

/**
 * Resolves environment variable patterns (${VAR}) in strings with security protections.
 *
 * Supports ${VAR_NAME} and ${VAR_NAME:default_value} syntax with:
 * - Recursive resolution of nested patterns
 * - Circular reference detection
 * - Maximum depth limits to prevent infinite loops
 * - Variable name validation to prevent injection
 * - Strict mode for required variables
 * @example
 * ```typescript
 * const resolver = new EnvVarPatternResolver({ strict: true });
 * const resolved = resolver.resolve('${HOME}/config/${APP_ENV:production}');
 * // Returns: '/Users/alice/config/production'
 * ```
 * @public
 */
export class EnvVarPatternResolver {
  private readonly maxDepth: number;
  private readonly strict: boolean;
  private readonly envSource: Record<string, string | undefined>;

  public constructor(config: EnvVarPatternResolverConfig = {}) {
    this.maxDepth = config.maxDepth ?? 10;
    this.strict = config.strict ?? true;
    this.envSource = config.envSource ?? process.env;
  }

  /**
   * Resolves environment variables in a string value.
   *
   * Recursively processes all ${VAR} patterns while tracking visited variables
   * to detect circular references and respecting the maximum depth limit.
   * @param value - String containing environment variable patterns
   * @param visitedVars - Set of variables being resolved (for circular detection)
   * @param depth - Current resolution depth
   * @throws {EnvironmentResolutionError} When circular reference, depth limit exceeded, or missing required variable
   * @public
   */
  public resolve(
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
   * Validates that a variable name follows secure naming conventions.
   *
   * Enforces uppercase letters, numbers, and underscores only,
   * starting with a letter or underscore to prevent injection attacks.
   * @param varName - Variable name to validate
   * @internal
   */
  private isValidVariableName(varName: string): boolean {
    // Allow only uppercase letters, numbers, and underscores
    // Must start with letter or underscore
    return /^[A-Z_][A-Z0-9_]*$/.test(varName);
  }

  /**
   * Checks if a string contains environment variable patterns.
   * @param value - String to check for patterns
   * @public
   */
  public static containsPattern(value: string): boolean {
    return /\$\{[A-Z_][A-Z0-9_]*(?::[^}]*)?\}/i.test(value);
  }

  /**
   * Resolves environment variable patterns in a string.
   *
   * Convenience method that creates a resolver instance and resolves in one call.
   * For repeated resolutions, create a resolver instance directly for better performance.
   * @param value - String to resolve
   * @param config - Optional resolver configuration
   * @public
   */
  public static resolvePattern(
    value: string,
    config?: EnvVarPatternResolverConfig,
  ): string {
    const resolver = new EnvVarPatternResolver(config);
    return resolver.resolve(value);
  }
}

/**
 * Resolves environment variable patterns in specific fields of a configuration object.
 *
 * Only processes string fields specified in the fields array, leaving other
 * fields unchanged. Creates a defensive copy of the configuration object.
 * @param config - Configuration object with potential environment variables
 * @param fields - Fields to check and resolve
 * @param envSource - Optional custom environment source
 * @throws {Error} When environment variable resolution fails
 * @public
 */
export function resolveConfigFields<
  T extends Record<string, string | undefined>,
>(
  config: T,
  fields: (keyof T)[],
  envSource?: Record<string, string | undefined>,
): T {
  const resolved = { ...config };

  for (const field of fields) {
    const value = config[field];
    if (typeof value === 'string') {
      try {
        resolved[field] = (
          EnvVarPatternResolver.containsPattern(value)
            ? EnvVarPatternResolver.resolvePattern(value, {
                envSource,
              })
            : value
        ) as T[keyof T];
      } catch (error) {
        throw new Error(
          error instanceof Error
            ? error.message
            : 'Environment variable resolution failed',
        );
      }
    }
  }

  return resolved;
}

/**
 * Resolves a single environment variable reference.
 *
 * Simple wrapper around EnvVarPatternResolver for resolving a single value.
 * @param value - String potentially containing environment variable patterns
 * @throws {Error} When environment variable resolution fails
 * @public
 */
export function resolveEnvVar(value: string): string {
  try {
    return EnvVarPatternResolver.containsPattern(value)
      ? EnvVarPatternResolver.resolvePattern(value)
      : value;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? error.message
        : 'Environment variable resolution failed',
    );
  }
}
