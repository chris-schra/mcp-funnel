import { spawn, type ChildProcess } from 'child_process';
import { TransportError } from '../../errors/transport-error.js';
import { handleSpawnError } from './spawn-error-handler.js';

/**
 * Options for spawning a process with timeout support.
 */
export interface ProcessSpawnOptions {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
  spawnTimeout?: number;
}

/**
 * Spawns a child process with optional timeout support.
 *
 * @param options - Process spawn configuration
 * @returns Promise resolving to spawned ChildProcess
 * @throws TransportError on spawn failure or timeout
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
 * @param process - Process to cleanup
 * @param serverName - Server name for logging
 * @param sessionId - Session ID for logging
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
