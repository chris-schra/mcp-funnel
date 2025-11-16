import type { DebuggerCommandResult, BreakpointSummary } from '../../src/types/index.js';

/**
 * Extracts breakpoint summaries from a debugger command result.
 * @param result - The command result to extract breakpoints from
 * @returns Array of breakpoint summaries, or empty array if none set
 * @internal
 */
export const getBreakpointSummary = (result: DebuggerCommandResult): BreakpointSummary[] =>
  result.setBreakpoints ?? [];
