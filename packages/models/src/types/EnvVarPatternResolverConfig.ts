/**
 * Configuration for environment variable resolution
 */
export interface EnvVarPatternResolverConfig {
  /** Maximum depth for nested variable resolution (prevents infinite loops) */
  maxDepth?: number;
  /** Whether to throw on missing variables without defaults */
  strict?: boolean;
  /** Custom environment source (defaults to process.env) */
  envSource?: Record<string, string | undefined>;
}
