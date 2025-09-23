// Re-export all types from types.js for public API
export type {
  UnusedExport,
  UnusedFile,
  TsrResult,
  TsUnusedCodeOptions,
  ProcessedResult,
  CliOptions,
  TsUnusedCodeResult,
  ProcessorConfig,
  AnalysisCache,
  Tool,
  ICommandOptions,
} from './types.js';

// Export command implementation
export { TsUnusedCodeCommand } from './command.js';

// Export processor for advanced usage
export { TsrProcessor } from './processor.js';
