import { ConsoleMessage, DebugRequest } from '../types/index.js';

/**
 * Console message verbosity levels for filtering
 */
export const VERBOSITY_LEVELS = {
  none: 0,
  'error-only': 1,
  'warn-error': 2,
  all: 3,
} as const;

/**
 * Console level priority mapping for filtering
 */
export const CONSOLE_LEVEL_PRIORITY = {
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
