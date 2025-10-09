/**
 * Shared types for command handlers.
 */

import type { TypeDocEngine } from '../core/engine.js';
import type { SymbolIndex } from '../core/symbolIndex.js';
import type { DescribeFileFormatter, DescribeSymbolFormatter } from '../formatters/index.js';
import type { YAMLDescribeFileFormatter } from '../formatters/yamlDescribeFileFormatter.js';
import type { DiagramGenerator } from '../services/diagramGenerator.js';

/**
 * Context object passed to command handlers.
 * Contains all resources needed for command execution.
 */
export interface CommandContext {
  engine: TypeDocEngine;
  symbolIndex: SymbolIndex;
  fileFormatter: DescribeFileFormatter;
  symbolFormatter: DescribeSymbolFormatter;
  yamlFormatter: YAMLDescribeFileFormatter;
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
}

/**
 * Arguments for understand_context/understand-context command.
 */
export interface UnderstandContextArgs {
  files: string[];
  focus?: string;
}
