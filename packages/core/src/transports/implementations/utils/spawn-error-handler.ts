/**
 * Spawn Error Handler Utilities for Stdio Transport
 *
 * Converts spawn/process errors to appropriate TransportErrors.
 * @internal
 */

import { TransportError } from '../../errors/transport-error.js';

/**
 * Converts spawn/process errors to appropriate TransportErrors based on error code.
 *
 * Maps common Node.js spawn error codes to semantic TransportError types:
 * - ENOENT: Command not found
 * - EACCES: Permission denied
 * - ENOTDIR: Invalid path
 * - EMFILE/ENFILE: Too many open files (service unavailable)
 * - ETIMEDOUT: Connection timeout
 * - Other errors: Generic connection failure
 * @param error - Error from child_process spawn
 * @param command - Command that was attempted to spawn
 * @param spawnTimeout - Optional timeout value for timeout errors
 * @returns Appropriate TransportError with user-friendly message
 * @internal
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
      return TransportError.serviceUnavailable(error instanceof Error ? error : undefined);
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
