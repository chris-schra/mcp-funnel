/**
 * Symbol enhancer interface for augmenting SymbolMetadata
 * Enhancers run after initial symbol collection to add additional metadata
 */

import type * as ts from 'typescript';
import type { ProjectReflection } from 'typedoc';
import type { SymbolMetadata } from '../types/index.js';

/**
 * Context provided to enhancers during enhancement phase
 */
export interface EnhancementContext {
  /** TypeDoc project reflection */
  project: ProjectReflection;
  /** TypeScript type checker for symbol resolution */
  checker: ts.TypeChecker;
  /** TypeScript program for accessing source files */
  program: ts.Program;
  /** Symbol index for fast lookup by ID */
  symbolIndex: Map<string, SymbolMetadata>;
}

/**
 * Interface for symbol enhancers
 * Enhancers modify SymbolMetadata in-place to add additional information
 */
export interface ISymbolEnhancer {
  /** Unique name identifier for the enhancer */
  name: string;

  /**
   * Enhance the provided symbols with additional metadata
   * Modifies symbols array in-place
   *
   * @param symbols - Array of symbols to enhance (modified in-place)
   * @param context - Enhancement context with TypeScript and TypeDoc access
   * @returns Promise that resolves when enhancement is complete
   */
  enhance(symbols: SymbolMetadata[], context: EnhancementContext): Promise<void>;
}
