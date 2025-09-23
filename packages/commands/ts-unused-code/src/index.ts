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

// Command implementation will be exported here in the next spark
// For now, add minimal export to make build work
export const placeholder = 'ts-unused-code command implementation pending';
