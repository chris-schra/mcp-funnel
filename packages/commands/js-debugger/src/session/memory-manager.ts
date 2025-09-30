/**
 * Memory management utilities for debug sessions
 * Handles console output buffering and memory estimation
 */

import type { ConsoleMessage, SessionMetadata } from '../types/index.js';

/**
 * Context for memory management operations
 */
export interface MemoryContext {
  consoleOutput: ConsoleMessage[];
  breakpointsSize: number;
  metadata: SessionMetadata;
}

/**
 * Configuration for console output circular buffer
 */
export interface ConsoleBufferConfig {
  maxEntries: number;
  keepRatio: number; // Fraction to keep when pruning (e.g., 0.8 = 80%)
}

const DEFAULT_BUFFER_CONFIG: ConsoleBufferConfig = {
  maxEntries: 1000,
  keepRatio: 0.8,
};

/**
 * Memory management operations for debug sessions
 */
export class MemoryManager {
  /**
   * Add a console message and manage circular buffer
   * Returns the updated console output array
   */
  static addConsoleMessage(
    consoleOutput: ConsoleMessage[],
    message: ConsoleMessage,
    config: ConsoleBufferConfig = DEFAULT_BUFFER_CONFIG,
  ): ConsoleMessage[] {
    const updated = [...consoleOutput, message];

    // Implement circular buffer to prevent memory leaks
    if (updated.length > config.maxEntries) {
      const keepCount = Math.floor(config.maxEntries * config.keepRatio);
      return updated.slice(-keepCount);
    }

    return updated;
  }

  /**
   * Update metadata with current console output size and memory estimate
   */
  static updateMemoryMetadata(
    context: MemoryContext,
  ): Pick<SessionMetadata, 'resourceUsage'> {
    return {
      resourceUsage: {
        consoleOutputSize: context.consoleOutput.length,
        memoryEstimate: MemoryManager.estimateMemoryUsage(context),
      },
    };
  }

  /**
   * Estimate memory usage for the session
   */
  static estimateMemoryUsage(context: MemoryContext): number {
    let estimate = 1024; // Base session overhead
    estimate += context.consoleOutput.length * 200; // ~200 bytes per message
    estimate += context.breakpointsSize * 100; // ~100 bytes per breakpoint
    estimate += 512; // Metadata overhead
    return estimate;
  }

  /**
   * Clear console output to free memory
   */
  static clearConsoleOutput(): ConsoleMessage[] {
    return [];
  }
}
