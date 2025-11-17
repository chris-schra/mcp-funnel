/**
 * Enhancement pipeline for orchestrating multi-stage symbol enhancement
 * Supports flexible stage-based execution with parallel and sequential processing
 */

import type { ISymbolEnhancer, EnhancementContext } from './ISymbolEnhancer.js';
import type { SymbolMetadata } from '../types/index.js';

/**
 * Type representing a pipeline stage
 * Can be either a single enhancer (sequential) or array of enhancers (parallel)
 */
export type EnhancerStage = ISymbolEnhancer | ISymbolEnhancer[];

/**
 * Error information captured during enhancement
 */
export interface EnhancementError {
  /** Name of the enhancer that failed */
  enhancer: string;
  /** The error that occurred */
  error: Error;
}

/**
 * Result of running the enhancement pipeline
 */
export interface EnhancementResult {
  /** Whether the pipeline completed without errors */
  success: boolean;
  /** Array of errors that occurred during enhancement */
  errors: EnhancementError[];
}

/**
 * Pipeline for orchestrating symbol enhancement across multiple stages
 *
 * Stages execute sequentially, but enhancers within a stage can run in parallel.
 * Errors are captured and logged but don't stop the pipeline.
 *
 * @example
 * ```typescript
 * const pipeline = new EnhancementPipeline([
 *   new JSDocEnhancer(),              // Stage 1: sequential
 *   [                                 // Stage 2: parallel
 *     new ReferenceEnhancer(),
 *     new MetricsEnhancer()
 *   ],
 *   new SummaryEnhancer()             // Stage 3: sequential
 * ]);
 *
 * const result = await pipeline.enhance(symbols, context);
 * if (!result.success) {
 *   console.error('Enhancement failed:', result.errors);
 * }
 * ```
 */
export class EnhancementPipeline {
  /**
   * Create a new enhancement pipeline
   *
   * @param stages - Array of enhancement stages to execute
   */
  public constructor(private readonly stages: EnhancerStage[]) {}

  /**
   * Execute all enhancement stages on the provided symbols
   *
   * @param symbols - Symbols to enhance (modified in-place)
   * @param context - Enhancement context with TypeScript and TypeDoc access
   * @returns Result with success status and any errors encountered
   */
  public async enhance(
    symbols: SymbolMetadata[],
    context: EnhancementContext,
  ): Promise<EnhancementResult> {
    const errors: EnhancementError[] = [];

    for (const stage of this.stages) {
      if (Array.isArray(stage)) {
        // Parallel stage: run all enhancers concurrently
        await this.executeParallelStage(stage, symbols, context, errors);
      } else {
        // Sequential stage: run single enhancer
        await this.executeEnhancer(stage, symbols, context, errors);
      }
    }

    return {
      success: errors.length === 0,
      errors,
    };
  }

  /**
   * Execute a parallel stage with multiple enhancers
   *
   * @param enhancers - Array of enhancers to run in parallel
   * @param symbols - Symbols to enhance
   * @param context - Enhancement context
   * @param errors - Array to accumulate errors
   */
  private async executeParallelStage(
    enhancers: ISymbolEnhancer[],
    symbols: SymbolMetadata[],
    context: EnhancementContext,
    errors: EnhancementError[],
  ): Promise<void> {
    await Promise.all(
      enhancers.map((enhancer) => this.executeEnhancer(enhancer, symbols, context, errors)),
    );
  }

  /**
   * Execute a single enhancer with error handling
   *
   * @param enhancer - Enhancer to execute
   * @param symbols - Symbols to enhance
   * @param context - Enhancement context
   * @param errors - Array to accumulate errors
   */
  private async executeEnhancer(
    enhancer: ISymbolEnhancer,
    symbols: SymbolMetadata[],
    context: EnhancementContext,
    errors: EnhancementError[],
  ): Promise<void> {
    try {
      await enhancer.enhance(symbols, context);
    } catch (error) {
      const enhancementError: EnhancementError = {
        enhancer: enhancer.name,
        error: error instanceof Error ? error : new Error(String(error)),
      };

      console.error(`Enhancer ${enhancer.name} failed:`, error);
      errors.push(enhancementError);
    }
  }
}
