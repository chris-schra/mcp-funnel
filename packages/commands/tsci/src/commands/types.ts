/**
 * Shared types for command handlers.
 */

import type { TypeDocEngine } from '../core/engine.js';
import type { SymbolIndex } from '../core/symbolIndex.js';
import type { DescribeFileFormatter, DescribeSymbolFormatter } from '../formatters/index.js';
import type { YAMLDescribeFileFormatter } from '../formatters/yamlDescribeFileFormatter.js';
import type { YAMLDescribeSymbolFormatter } from '../formatters/yamlDescribeSymbolFormatter.js';
import type { DiagramGenerator } from '../services/diagramGenerator.js';

/**
 * Context object passed to command handlers.
 * Contains all resources needed for command execution.
 *
 * Note: engine and symbolIndex are optional to support lazy initialization
 * in describeFile (which doesn't need them for small files).
 */
export interface CommandContext {
  engine?: TypeDocEngine;
  symbolIndex?: SymbolIndex;
  fileFormatter: DescribeFileFormatter;
  symbolFormatter: DescribeSymbolFormatter;
  yamlFormatter: YAMLDescribeFileFormatter;
  yamlSymbolFormatter: YAMLDescribeSymbolFormatter;
  diagramGenerator: DiagramGenerator;
}

/**
 * Arguments for describe_file/describe-file command.
 */
export interface DescribeFileArgs {
  file: string;
  verbosity?: 'minimal' | 'normal' | 'detailed';
}

/**
 * Arguments for describe_symbol/describe-symbol command.
 */
export interface DescribeSymbolArgs {
  symbolId: string;
  verbosity?: 'minimal' | 'normal' | 'detailed';
  /**
   * Optional file path from target project for cross-project symbol lookups.
   * When provided, TSCI will detect and use the tsconfig.json for that file's project.
   */
  file?: string;
}

/**
 * Arguments for understand_context/understand-context command.
 */
export interface UnderstandContextArgs {
  files: string[];
  focus?: string;
  /**
   * Maximum depth for import graph traversal (default: 3)
   * Total levels shown: maxDepth (incoming) + focus file + maxDepth (outgoing) = up to 2*maxDepth + 1 levels
   */
  maxDepth?: number;
  /**
   * Ignore imports from node_modules (default: false)
   * When false, external dependencies are included in the diagram
   */
  ignoreNodeModules?: boolean;
}
