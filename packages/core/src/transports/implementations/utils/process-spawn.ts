import { spawn, type ChildProcess } from 'child_process';
import { TransportError } from '../../errors/transport-error.js';
import { handleSpawnError } from './spawn-error-handler.js';

/**
 * Options for spawning a process with timeout support.
 * @internal
 */
export interface ProcessSpawnOptions {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  spawnTimeout?: number;
}

/**
 * Spawns a child process with optional timeout and error handling.
 *
 * Creates a child process with full stdio pipe control. If a spawn timeout
 * is specified, rejects if the process doesn't spawn within that period.
 * All spawn errors are mapped to appropriate TransportError types.
 * @param options - Process spawn configuration including command, args, and timeout
 * @returns Promise resolving to spawned ChildProcess once successfully started
 * @throws {TransportError} Mapped from spawn errors:
 *   - ENOENT: Command not found
 *   - EACCES: Permission denied
 *   - ETIMEDOUT: Spawn timeout exceeded
 *   - Other errors: Connection failed
 * @internal
 */
export async function spawnProcessWithTimeout(
  options: ProcessSpawnOptions,
): Promise<ChildProcess> {
  return new Promise((resolve, reject) => {
    const { command, args, env, cwd, spawnTimeout } = options;
    let timeoutId: NodeJS.Timeout | undefined;

    if (spawnTimeout && spawnTimeout > 0) {
      timeoutId = setTimeout(() => {
        reject(TransportError.connectionTimeout(spawnTimeout));
      }, spawnTimeout);
    }

    try {
      const process = spawn(command, args, {
        env,
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'], // Full control over all streams
      });

      // Clear timeout on successful spawn
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Handle immediate spawn errors
      process.on('error', (error) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(handleSpawnError(error, command, spawnTimeout));
      });

      // Process spawned successfully
      resolve(process);
    } catch (error) {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      reject(handleSpawnError(error, command, spawnTimeout));
    }
  });
}

/**
 * Cleans up a child process gracefully with fallback to force kill.
 *
 * Attempts graceful termination via SIGTERM, then forces SIGKILL after 1 second
 * if the process hasn't exited. Handles cases where the process is already dead.
 * @param process - Process to cleanup, or undefined if no process exists
 * @param serverName - Server name for debug logging
 * @param sessionId - Optional session ID for debug logging
 * @internal
 */
export function cleanupProcess(
  process: ChildProcess | undefined,
  serverName: string,
  sessionId?: string,
): void {
  if (process) {
    try {
      // Try graceful termination first
      process.kill('SIGTERM');

      // Force kill after a brief delay if still running
      setTimeout(() => {
        if (process && !process.killed) {
          process.kill('SIGKILL');
        }
      }, 1000);
    } catch (cleanupError) {
      // Process might already be dead, that's okay
      console.debug(`[Transport] Cleanup error for ${serverName}:`, {
        sessionId,
        error:
          cleanupError instanceof Error
            ? cleanupError.message
            : String(cleanupError),
      });
    }
  }
}
