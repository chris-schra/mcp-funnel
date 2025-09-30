import { DebugSession } from '../types/index.js';

/**
 * Estimate memory usage for a session
 */
export function estimateSessionMemoryUsage(session: DebugSession): number {
  let memoryEstimate = 0;

  // Base session overhead
  memoryEstimate += 1024; // 1KB base

  // Console output estimate
  memoryEstimate += session.consoleOutput.length * 200; // ~200 bytes per message

  // Breakpoints estimate
  memoryEstimate += session.breakpoints.size * 100; // ~100 bytes per breakpoint

  // Metadata estimate
  if (session.metadata) {
    memoryEstimate += 512; // ~512 bytes for metadata
  }

  return memoryEstimate;
}
