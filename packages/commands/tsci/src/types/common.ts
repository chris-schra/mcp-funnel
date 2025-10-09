/**
 * Core types for tsci command
 */

/**
 * TypeScript configuration file resolution result
 */
export interface TSConfigResolution {
  /** Absolute path to the tsconfig.json file */
  path: string;
  /** Whether the file exists on disk */
  exists: boolean;
}

/**
 * Options for initializing the TypeDoc engine
 */
export interface EngineOptions {
  /** Path to tsconfig.json (absolute or relative to cwd) */
  tsconfig: string;
  /** Entry points for TypeDoc analysis (files or directories) */
  entryPoints?: string[];
  /** Exclude private members from analysis */
  excludePrivate?: boolean;
  /** Exclude protected members from analysis */
  excludeProtected?: boolean;
  /** Exclude internal members (marked with \@internal) from analysis */
  excludeInternal?: boolean;
  /** Skip TypeScript error checking for faster processing */
  skipErrorChecking?: boolean;
}
