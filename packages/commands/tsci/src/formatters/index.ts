/**
 * Formatters module for tsci command
 *
 * Provides output formatting with verbosity control and token optimization.
 * Exports types, formatters, and utilities for transforming symbol metadata
 * into AI-optimized output.
 */

// Types and interfaces
export type {
  VerbosityLevel,
  FormatOptions,
  IFormatter,
  FormattedOutput,
  UsageLocation,
  UsageSummary,
  ExternalReferenceSummary,
  SymbolSummary,
  SymbolDetail,
  DescribeFileOutput,
  DescribeSymbolOutput,
  SymbolMetadata,
  IDescribeFileFormatter,
  IDescribeSymbolFormatter,
} from './types.js';

// Utilities
export {
  estimateTokens,
  truncateSignature,
  formatLineNumbers,
  toUsageSummaries,
  shouldIncludeUsages,
  shouldIncludeReferences,
  getMaxDepth,
  createInlineSignature,
  formatJson,
} from './utils.js';

// File formatter
export {
  DescribeFileFormatter,
  createDescribeFileFormatter,
  formatFile,
} from './describeFileFormatter.js';

// Symbol formatter
export {
  DescribeSymbolFormatter,
  createDescribeSymbolFormatter,
  formatSymbol,
} from './describeSymbolFormatter.js';
