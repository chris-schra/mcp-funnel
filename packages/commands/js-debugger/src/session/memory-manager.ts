/**
 * Memory management utilities for debug sessions.
 *
 * Provides circular buffer management for console output and memory usage tracking
 * to prevent unbounded memory growth during long-running debug sessions.
 * @public
 * @see file:./enhanced-debug-session.ts:523 - Primary usage in EnhancedDebugSession
 */

import type { ConsoleMessage, SessionMetadata } from '../types/index.js';

/**
 * Context for memory management operations.
 * @public
 */
export interface MemoryContext {
  /** Accumulated console messages from the debug session */
  consoleOutput: ConsoleMessage[];
  /** Number of active breakpoints (affects memory estimate) */
  breakpointsSize: number;
  /** Session metadata including resource usage tracking */
  metadata: SessionMetadata;
}

/**
 * Configuration for console output circular buffer management.
 * @public
 */
export interface ConsoleBufferConfig {
  /** Maximum console messages before pruning occurs */
  maxEntries: number;
  /** Fraction of entries to retain when pruning (0.8 = keep 80% most recent) */
  keepRatio: number;
}

const DEFAULT_BUFFER_CONFIG: ConsoleBufferConfig = {
  maxEntries: 1000,
  keepRatio: 0.8,
};

/**
 * Memory management operations for debug sessions.
 *
 * Provides static utility methods for managing console output buffering
 * and calculating memory usage estimates.
 * @public
 */
export class MemoryManager {
  /**
   * Appends a console message and automatically prunes old messages when capacity is exceeded.
   *
   * Implements a circular buffer pattern: when the buffer exceeds `maxEntries`, it retains
   * the most recent `keepRatio` fraction of messages, discarding older entries to prevent
   * unbounded memory growth.
   * @param {ConsoleMessage[]} consoleOutput - Current array of console messages
   * @param {ConsoleMessage} message - New message to append
   * @param {ConsoleBufferConfig} config - Buffer configuration controlling pruning behavior
   * @returns {ConsoleMessage[]} New array with message added and potentially pruned
   * @example
   * ```typescript
   * const output = MemoryManager.addConsoleMessage(
   *   session.consoleOutput,
   *   { level: 'log', timestamp: '2025-01-15T10:30:00Z', message: 'Hello', args: [] }
   * );
   * // If output exceeds 1000 entries, keeps most recent 800 (80%)
   * ```
   * @public
   * @see file:../enhanced-debug-session.ts:523 - Used when capturing console output
   */
  public static addConsoleMessage(
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
   * Computes the resourceUsage portion of session metadata.
   *
   * Calculates current console output size and estimated memory usage
   * for inclusion in session metadata tracking.
   * @param {MemoryContext} context - Memory context containing console output and breakpoints
   * @returns {Pick<SessionMetadata, 'resourceUsage'>} Partial metadata object with resourceUsage field populated
   * @example
   * ```typescript
   * const memoryData = MemoryManager.updateMemoryMetadata({
   *   consoleOutput: session.consoleOutput,
   *   breakpointsSize: session.breakpoints.size,
   *   metadata: session.metadata
   * });
   * Object.assign(session.metadata, memoryData);
   * ```
   * @public
   * @see file:../enhanced-debug-session.ts:536 - Updates session metadata after console messages
   */
  public static updateMemoryMetadata(
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
   * Calculates approximate memory usage in bytes for a debug session.
   *
   * Uses heuristic estimates based on typical data structure sizes:
   * - 1024 bytes base session overhead
   * - ~200 bytes per console message
   * - ~100 bytes per breakpoint
   * - 512 bytes metadata overhead
   *
   * Note: This is a rough approximation for resource tracking purposes, not an exact measurement.
   * Actual memory usage depends on console message content size and object overhead.
   * @param {MemoryContext} context - Memory context with console output and breakpoint count
   * @returns {number} Estimated memory usage in bytes
   * @public
   */
  public static estimateMemoryUsage(context: MemoryContext): number {
    let estimate = 1024; // Base session overhead
    estimate += context.consoleOutput.length * 200; // ~200 bytes per message
    estimate += context.breakpointsSize * 100; // ~100 bytes per breakpoint
    estimate += 512; // Metadata overhead
    return estimate;
  }

  /**
   * Returns an empty console output array.
   *
   * Used during session termination to clear accumulated console messages
   * and free associated memory.
   * @returns {ConsoleMessage[]} Empty array ready for reuse or disposal
   * @public
   * @see file:../enhanced-debug-session.ts:457 - Clears output on session termination
   */
  public static clearConsoleOutput(): ConsoleMessage[] {
    return [];
  }
}
