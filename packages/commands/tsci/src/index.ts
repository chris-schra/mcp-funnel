/**
 * Main exports for \@mcp-funnel/command-tsci
 * TypeScript Code Intelligence command for MCP Funnel
 */

// Main command
import { TSCICommand } from './command.js';
export { TSCICommand };

// Default export: command instance for discovery
export default new TSCICommand();

// Core engine and components
export { TypeDocEngine } from './core/engine.js';
export { SymbolCollector } from './core/symbolCollector.js';
export { SymbolIndex } from './core/symbolIndex.js';

// Utilities
export { resolveTsConfig, findTsConfig } from './util/tsconfig.js';

// Types
export type {
  TSConfigResolution,
  EngineOptions,
  SymbolMetadata,
  SymbolUsage,
  ExternalReference,
  SymbolFilter,
} from './types/index.js';

// Formatters
export {
  // File formatter
  DescribeFileFormatter,
  createDescribeFileFormatter,
  formatFile,
  // Symbol formatter
  DescribeSymbolFormatter,
  createDescribeSymbolFormatter,
  formatSymbol,
  // Utilities
  estimateTokens,
  truncateSignature,
  formatLineNumbers,
  toUsageSummaries,
  shouldIncludeUsages,
  shouldIncludeReferences,
  getMaxDepth,
  createInlineSignature,
  formatJson,
} from './formatters/index.js';

// Formatter types
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
  IDescribeFileFormatter,
  IDescribeSymbolFormatter,
} from './formatters/types.js';

// Re-export TypeDoc's ReflectionKind for convenience
export { ReflectionKind } from 'typedoc';
