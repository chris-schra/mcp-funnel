/**
 * Formatter types and interfaces for tsci command output
 *
 * This module defines the type system for formatters with SEAMS for extension.
 * Default verbosity is 'minimal' to optimize token usage.
 */

/**
 * Verbosity levels control the amount of detail in formatted output
 * - minimal: Symbol name + inline signature + line number only
 * - normal: + usages (where symbols are used)
 * - detailed: + references (external types with previews)
 */
export type VerbosityLevel = 'minimal' | 'normal' | 'detailed';

/**
 * Options for controlling formatter output
 */
export interface FormatOptions {
  /**
   * Level of detail in output (default: 'minimal')
   */
  verbosity?: VerbosityLevel;

  /**
   * Include usage locations (default: false unless verbosity \>= 'normal')
   */
  includeUsages?: boolean;

  /**
   * Include external references (default: false unless verbosity \>= 'normal')
   */
  includeReferences?: boolean;

  /**
   * Maximum depth for nested structures (default: 3)
   */
  maxDepth?: number;
}

/**
 * SEAM: Generic formatter interface for future extension
 *
 * Allows custom formatters to be plugged in without changing core logic
 */
export interface IFormatter<TInput, TOutput> {
  /**
   * Format data according to the provided options
   */
  format(data: TInput, options: FormatOptions): TOutput;
}

/**
 * Base formatted output with token estimation
 */
export interface FormattedOutput {
  /**
   * Formatted content string
   */
  content: string;

  /**
   * Approximate token count for AI context planning
   */
  tokenEstimate: number;
}

/**
 * Location information for a symbol usage
 */
export interface UsageLocation {
  /**
   * File path relative to project root
   */
  file: string;

  /**
   * Line numbers where symbol is used
   */
  lines: number[];
}

/**
 * Summary of where a symbol is used
 */
export interface UsageSummary {
  /**
   * File path where symbol is used
   */
  file: string;

  /**
   * Line numbers of usages
   */
  lines: number[];

  /**
   * Number of usages in this file
   */
  count: number;
}

/**
 * Information about an external type reference
 */
export interface ExternalReferenceSummary {
  /**
   * Name of the referenced type
   */
  name: string;

  /**
   * Source of the reference (module name or file path)
   */
  source: string;

  /**
   * Kind of reference (interface, type, class, etc.)
   */
  kind: string;

  /**
   * Signature preview (only in detailed mode)
   */
  signature?: string;
}

/**
 * Summary of a symbol for file-level output
 */
export interface SymbolSummary {
  /**
   * Inline signature (e.g., "function foo(x: string): number")
   */
  inline: string;

  /**
   * Line number where symbol is defined
   */
  line: number;

  /**
   * Usage locations (only if includeUsages=true)
   */
  usages?: UsageSummary[];
}

/**
 * Detailed information about a specific symbol
 */
export interface SymbolDetail {
  /**
   * Unique identifier for the symbol
   */
  id: string;

  /**
   * Symbol name
   */
  name: string;

  /**
   * Symbol kind (function, class, interface, etc.)
   */
  kind: string;

  /**
   * Full signature
   */
  signature: string;

  /**
   * File path where symbol is defined
   */
  file: string;

  /**
   * Line number where symbol is defined
   */
  line: number;

  /**
   * Whether the symbol is exported
   */
  isExported: boolean;
}

/**
 * Output format for describe_file tool
 */
export interface DescribeFileOutput {
  /**
   * File path
   */
  file: string;

  /**
   * Symbol summaries in the file
   */
  symbols: SymbolSummary[];

  /**
   * External references (only if verbosity \>= 'normal')
   */
  references?: ExternalReferenceSummary[];

  /**
   * Approximate token count
   */
  tokenEstimate: number;
}

/**
 * Output format for describe_symbol tool
 */
export interface DescribeSymbolOutput {
  /**
   * Detailed symbol information
   */
  symbol: SymbolDetail;

  /**
   * Usage locations (if verbosity \>= 'normal')
   */
  usages?: UsageSummary[];

  /**
   * External references (if verbosity \>= 'normal')
   */
  references?: ExternalReferenceSummary[];

  /**
   * Approximate token count
   */
  tokenEstimate: number;
}

/**
 * Re-export SymbolMetadata from types/symbols.ts
 * This is the actual symbol metadata structure from TypeDoc analysis
 */
import type { SymbolMetadata as SymbolMetadataType } from '../types/symbols.js';
export type SymbolMetadata = SymbolMetadataType;

/**
 * SEAM: Formatter interface for describe_file tool
 */
export interface IDescribeFileFormatter extends IFormatter<SymbolMetadata[], DescribeFileOutput> {
  format(symbols: SymbolMetadata[], options: FormatOptions): DescribeFileOutput;
}

/**
 * SEAM: Formatter interface for describe_symbol tool
 */
export interface IDescribeSymbolFormatter extends IFormatter<SymbolMetadata, DescribeSymbolOutput> {
  format(symbol: SymbolMetadata, options: FormatOptions): DescribeSymbolOutput;
}
