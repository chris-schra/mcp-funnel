import type {
  ConsoleMessage,
  DebugRequest,
  DebugSession,
  SessionLifecycleState,
} from '../types/index.js';

/**
 * Console message verbosity levels for filtering
 */
const VERBOSITY_LEVELS = {
  none: 0,
  'error-only': 1,
  'warn-error': 2,
  all: 3,
} as const;

/**
 * Console level priority mapping for filtering
 */
const CONSOLE_LEVEL_PRIORITY = {
  error: 1,
  warn: 2,
  info: 3,
  log: 3,
  debug: 3,
  trace: 3,
} as const;

/**
 * Helper method to filter console messages based on verbosity setting
 */
export function shouldIncludeConsoleMessage(
  message: ConsoleMessage,
  verbosity: DebugRequest['consoleVerbosity'] = 'all',
): boolean {
  const verbosityLevel = VERBOSITY_LEVELS[verbosity];
  const messageLevel = CONSOLE_LEVEL_PRIORITY[message.level];

  return messageLevel <= verbosityLevel;
}

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

/**
 * Create a snapshot of a session for termination tracking
 */
export function createSessionSnapshot(session: DebugSession): DebugSession {
  return {
    ...session,
    breakpoints: new Map(session.breakpoints),
    consoleOutput: [...session.consoleOutput],
    state: { status: 'terminated' },
    lifecycleState: 'terminated' as SessionLifecycleState,
    metadata: session.metadata ? { ...session.metadata } : undefined,
    cleanup: undefined,
  };
}

/**
 * Update session activity metadata
 */
export function updateSessionActivity(
  session: DebugSession,
  activityCount: number,
): void {
  if (session.metadata) {
    const now = new Date().toISOString();
    session.metadata.lastActivityAt = now;
    session.metadata.activityCount = activityCount;
  }
}
