/**
 * Logging infrastructure exports
 *
 * Provides structured logging with automatic redaction via pino + fast-redact
 */

// Pino setup with automatic redaction
export { rootLogger, setupConsoleLogging } from './pino-setup.js';

// Legacy logging (for backwards compatibility)
export {
  logEvent,
  logError,
  getServerStreamLogPath,
  ConsoleLogger,
  NoOpLogger,
  defaultLogger,
  setDefaultLogger,
  createScopedLogger,
} from '../logger.js';
export type { LogLevel, ILogger } from '../logger.js';
