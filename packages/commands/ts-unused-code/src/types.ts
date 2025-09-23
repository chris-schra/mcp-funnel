import type { ICommandOptions } from '@mcp-funnel/commands-core';

/**
 * Information about an unused export detected by TSR
 */
export interface UnusedExport {
  /** File path where the unused export is located */
  file: string;
  /** Name of the unused export (can be 'default' for default exports) */
  name: string;
  /** TypeScript syntax kind of the export declaration */
  kind:
    | 'class'
    | 'function'
    | 'interface'
    | 'type'
    | 'variable'
    | 'enum'
    | 'namespace'
    | 'export'
    | 'default';
  /** Line number where the export is defined */
  line: number;
  /** Column number where the export starts */
  column: number;
  /** Position in the file (character offset) */
  position: number;
  /** Whether this export can be automatically removed */
  fixable: boolean;
  /** Original code snippet of the export */
  code: string;
}

/**
 * Information about an unused file detected by TSR
 */
export interface UnusedFile {
  /** File path of the unused file */
  file: string;
  /** Whether this file can be safely deleted */
  deletable: boolean;
  /** Reason why file is considered unused */
  reason: 'no-imports' | 'isolated' | 'test-file' | 'other';
}

/**
 * Result from TSR analysis containing all unused code findings
 */
export interface TsrResult {
  /** List of unused exports found in the project */
  unusedExports: UnusedExport[];
  /** List of unused files found in the project */
  unusedFiles: UnusedFile[];
  /** Total number of files analyzed */
  totalFiles: number;
  /** Files that were skipped during analysis */
  skippedFiles: string[];
  /** Errors encountered during analysis */
  errors: Array<{
    file: string;
    message: string;
    code?: string;
  }>;
  /** Analysis duration in milliseconds */
  duration: number;
}

/**
 * Options for running the ts-unused-code command
 */
export interface TsUnusedCodeOptions extends ICommandOptions {
  /** Entry point patterns (regex) to define code boundaries */
  entrypoints?: string[];
  /** Path to tsconfig.json file (defaults to auto-discovery) */
  tsConfigFile?: string;
  /** Enable automatic fixing by removing unused exports/files */
  autoFix?: boolean;
  /** Include .d.ts files in analysis */
  includeDts?: boolean;
  /** Enable recursive analysis of dependencies */
  recursive?: boolean;
  /** Project root directory (defaults to current working directory) */
  projectRoot?: string;
}

/**
 * Processed result with metadata and SEAM extension points
 */
export interface ProcessedResult {
  /** Raw TSR analysis result */
  raw: TsrResult;
  /**
   * SEAM: Metadata field for future enhancements
   * Could include: caching info, performance metrics, suggestions, etc.
   */
  metadata: {
    /** Timestamp when analysis was performed */
    timestamp: string;
    /** Version of TSR library used */
    tsrVersion?: string;
    /** Analysis statistics */
    stats: {
      /** Number of fixable unused exports */
      fixableExports: number;
      /** Number of deletable unused files */
      deletableFiles: number;
      /** Estimated bytes that could be saved */
      potentialSavings?: number;
    };
    /** SEAM: Extensible field for future metadata */
    [key: string]: unknown;
  };
  /**
   * SEAM: Suggested actions for AI or user workflow
   * Future extensions could add more sophisticated recommendations
   */
  suggestions: Array<{
    type: 'remove-export' | 'delete-file' | 'investigate' | 'refactor';
    file: string;
    description: string;
    /** SEAM: Safety level for automatic fixes */
    confidence: 'high' | 'medium' | 'low';
    /** SEAM: Additional context for extensions */
    context?: Record<string, unknown>;
  }>;
}

/**
 * CLI-specific options extending the base command options
 */
export interface CliOptions extends TsUnusedCodeOptions {
  /** Output results in JSON format */
  json?: boolean;
  /** Show help information */
  help?: boolean;
  /** Enable progress reporting during analysis */
  progress?: boolean;
  /** Limit output to most critical issues */
  severity?: 'all' | 'high' | 'medium';
}

/**
 * Result format for MCP tool responses
 */
export interface TsUnusedCodeResult {
  /** Analysis status */
  status: 'success' | 'error' | 'warning';
  /** Human-readable summary message */
  summary: string;
  /** Detailed results */
  result: ProcessedResult;
  /** Files that were modified (when autoFix is enabled) */
  modifiedFiles?: string[];
  /** Files that were deleted (when autoFix is enabled) */
  deletedFiles?: string[];
  /**
   * SEAM: Execution context for future extensions
   * Could include: cache usage, performance data, warnings, etc.
   */
  executionContext?: {
    /** Total execution time in milliseconds */
    executionTime: number;
    /** Memory usage statistics */
    memoryUsage?: Record<string, number>;
    /** Cache hit/miss statistics */
    cacheStats?: Record<string, number>;
    /** SEAM: Extensible field for future context */
    [key: string]: unknown;
  };
}

/**
 * SEAM: Configuration interface for future processor customization
 * Allows extending behavior without breaking existing implementations
 */
export interface ProcessorConfig {
  /** Custom filters for export analysis */
  exportFilters?: {
    /** Exclude exports matching these patterns */
    exclude?: RegExp[];
    /** Include only exports matching these patterns */
    include?: RegExp[];
  };
  /** Custom filters for file analysis */
  fileFilters?: {
    /** Exclude files matching these patterns */
    exclude?: RegExp[];
    /** Include only files matching these patterns */
    include?: RegExp[];
  };
  /** SEAM: Custom hooks for extending analysis */
  hooks?: {
    /** Called before analysis starts */
    beforeAnalysis?: (options: TsUnusedCodeOptions) => Promise<void> | void;
    /** Called after analysis completes */
    afterAnalysis?: (result: TsrResult) => Promise<TsrResult> | TsrResult;
    /** SEAM: Additional hooks for future features */
    [key: string]: unknown;
  };
  /** SEAM: Extensible configuration for future features */
  [key: string]: unknown;
}

/**
 * SEAM: Cache interface for performance optimization in future versions
 */
export interface AnalysisCache {
  /** Get cached result for given configuration */
  get(key: string): Promise<TsrResult | null>;
  /** Store result in cache */
  set(key: string, result: TsrResult, ttl?: number): Promise<void>;
  /** Clear cache entries */
  clear(): Promise<void>;
  /** Check if cache contains key */
  has(key: string): Promise<boolean>;
}

// Re-export commonly used MCP SDK types for convenience
export type { Tool } from '@modelcontextprotocol/sdk/types.js';
export type { ICommandOptions } from '@mcp-funnel/commands-core';
