/**
 * Spawn Error Handler Utilities for Stdio Transport
 *
 * Converts spawn/process errors to appropriate TransportErrors.
 */

import { TransportError } from '../../errors/transport-error.js';

/**
 * Converts spawn/process errors to appropriate TransportErrors
 */
export function handleSpawnError(
  error: unknown,
  command: string,
  spawnTimeout: number | undefined,
): TransportError {
  const err = error as { code?: string; message?: string; syscall?: string };

  // Map common spawn errors to transport error types
  switch (err.code) {
    case 'ENOENT':
      return TransportError.connectionFailed(
        `Command not found: ${command}`,
        error instanceof Error ? error : undefined,
      );
    case 'EACCES':
      return TransportError.connectionFailed(
        `Permission denied executing: ${command}`,
        error instanceof Error ? error : undefined,
      );
    case 'ENOTDIR':
      return TransportError.connectionFailed(
        `Invalid path: ${command}`,
        error instanceof Error ? error : undefined,
      );
    case 'EMFILE':
    case 'ENFILE':
      return TransportError.serviceUnavailable(
        error instanceof Error ? error : undefined,
      );
    case 'ETIMEDOUT':
      return TransportError.connectionTimeout(
        spawnTimeout || 30000,
        error instanceof Error ? error : undefined,
      );
    default:
      return TransportError.connectionFailed(
        err.message || String(error),
        error instanceof Error ? error : undefined,
      );
  }
}
