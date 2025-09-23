import type {
  TsUnusedCodeOptions,
  ProcessedResult,
  TsrResult,
  ProcessorConfig,
} from './types.js';

/**
 * Mock processor interface for compilation during parallel development
 * The actual implementation will be provided by Spark #58
 */
export class TsrProcessor {
  constructor(_config?: ProcessorConfig) {
    // Mock implementation - will be replaced by actual processor
  }

  /**
   * Analyze TypeScript project for unused exports and files
   * @param options - Analysis options including entry points and configuration
   * @returns Processed result with findings and metadata
   */
  async analyze(_options: TsUnusedCodeOptions): Promise<ProcessedResult> {
    // Mock implementation for compilation
    // The actual implementation will be provided by Spark #58
    const mockResult: TsrResult = {
      unusedExports: [],
      unusedFiles: [],
      totalFiles: 0,
      skippedFiles: [],
      errors: [],
      duration: 0,
    };

    return {
      raw: mockResult,
      metadata: {
        timestamp: new Date().toISOString(),
        tsrVersion: '1.0.0',
        stats: {
          fixableExports: 0,
          deletableFiles: 0,
          potentialSavings: 0,
        },
      },
      suggestions: [],
    };
  }
}
