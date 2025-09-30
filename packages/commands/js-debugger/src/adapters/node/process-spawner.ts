import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Configuration options for spawning Node.js processes with inspector
 */
export interface SpawnOptions {
  /** Runtime command (default: 'node') */
  command?: string;
  /** Inspector port (default: 0 for random) */
  port?: number;
  /** Stop on entry point (default: true, uses --inspect-brk) */
  stopOnEntry?: boolean;
  /** Additional arguments passed to the runtime */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout for inspector URL extraction (default: 7000ms) */
  timeoutMs?: number;
}

/**
 * Result of successful process spawn operation
 */
export interface SpawnResult {
  /** Spawned child process */
  process: ChildProcess;
  /** WebSocket debugger URL extracted from process output */
  wsUrl: string;
  /** Inspector port number */
  port: number;
}

/**
 * Process output stream data
 */
export interface ProcessOutput {
  type: 'stdout' | 'stderr';
  data: Buffer;
  text: string;
}

/**
 * Node.js process spawner with Chrome DevTools Protocol inspector support
 *
 * Spawns Node.js processes with --inspect or --inspect-brk flags and extracts
 * the WebSocket debugger URL from process output for CDP connections.
 */
export class ProcessSpawner extends EventEmitter {
  /**
   * Spawn a Node.js process with inspector enabled
   *
   * @param target - Script file path or inline script to execute
   * @param options - Spawn configuration options
   * @returns Promise resolving to spawn result with process and WebSocket URL
   */
  async spawn(
    target: string,
    options: SpawnOptions = {},
  ): Promise<SpawnResult> {
    const {
      command = 'node',
      port = 0,
      args = [],
      env = {},
      timeoutMs = 7000,
    } = options;

    // Build runtime arguments with proper command handling
    const { runtime, runtimeArgs } = this.buildRuntimeArgs(command, port, args);

    // Combine script target with runtime args
    const spawnArgs = [...runtimeArgs, target];

    // Prepare environment with user overrides
    const processEnv = { ...process.env, ...env };

    console.debug('[ProcessSpawner] Spawning process:', {
      runtime,
      spawnArgs,
      target,
    });

    // Spawn the process
    const childProcess = spawn(runtime, spawnArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: processEnv,
    });

    console.debug(
      '[ProcessSpawner] Process spawned with PID:',
      childProcess.pid,
    );

    try {
      // Extract WebSocket URL and port from process output
      const { wsUrl, extractedPort } = await this.extractInspectorUrl(
        childProcess,
        timeoutMs,
      );

      return {
        process: childProcess,
        wsUrl,
        port: extractedPort,
      };
    } catch (error) {
      // Cleanup on failure
      await this.kill(childProcess);
      throw error;
    }
  }

  /**
   * Terminate a spawned process gracefully
   *
   * @param process - Child process to terminate
   * @param timeoutMs - Timeout for graceful termination (default: 2000ms)
   */
  async kill(process: ChildProcess, timeoutMs = 2000): Promise<void> {
    if (process.killed || process.exitCode !== null) {
      return;
    }

    return new Promise<void>((resolve) => {
      const cleanup = () => {
        clearTimeout(forceKillTimeout);
        process.removeListener('exit', onExit);
        resolve();
      };

      const onExit = () => cleanup();

      // Set up forced termination if graceful doesn't work
      const forceKillTimeout = setTimeout(() => {
        if (!process.killed && process.exitCode === null) {
          process.kill('SIGKILL');
        }
        cleanup();
      }, timeoutMs);

      process.once('exit', onExit);

      // Attempt graceful termination
      process.kill('SIGTERM');
    });
  }

  /**
   * Build runtime arguments for different Node.js commands
   */
  protected buildRuntimeArgs(
    command: string,
    port: number,
    userArgs: string[],
  ): { runtime: string; runtimeArgs: string[] } {
    // ALWAYS use --inspect-brk as per requirement
    const inspectArg = port === 0 ? '--inspect-brk=0' : `--inspect-brk=${port}`;

    console.debug('[ProcessSpawner] Building runtime args:', {
      command,
      port,
      inspectArg,
      userArgs,
    });

    // ALWAYS use node as the runtime
    const result = {
      runtime: 'node',
      runtimeArgs: [inspectArg, ...userArgs],
    };

    console.debug('[ProcessSpawner] Final runtime args:', result);
    return result;
  }

  /**
   * Extract inspector WebSocket URL from process output
   */
  private async extractInspectorUrl(
    process: ChildProcess,
    timeoutMs: number,
  ): Promise<{ wsUrl: string; extractedPort: number }> {
    return new Promise<{ wsUrl: string; extractedPort: number }>(
      (resolve, reject) => {
        let combinedOutput = '';
        let resolved = false;

        const cleanup = () => {
          clearTimeout(timeout);
          process.stdout?.removeListener('data', handleStdout);
          process.stderr?.removeListener('data', handleStderr);
          process.removeListener('error', handleError);
          process.removeListener('exit', handleExit);
        };

        const timeout = setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(
              new Error(
                `Inspector URL extraction timed out after ${timeoutMs}ms.\n` +
                  `Process output: ${combinedOutput}`,
              ),
            );
          }
        }, timeoutMs);

        const handleStdout = (data: Buffer) => {
          const text = data.toString();
          combinedOutput += text;

          // Emit output event for monitoring
          this.emit('output', {
            type: 'stdout',
            data,
            text,
          } as ProcessOutput);
        };

        const handleStderr = (data: Buffer) => {
          const text = data.toString();
          combinedOutput += text;

          // Emit output event for monitoring
          this.emit('output', {
            type: 'stderr',
            data,
            text,
          } as ProcessOutput);

          // Look for inspector URL pattern (comes via stderr)
          const match = text.match(/Debugger listening on (ws:\/\/[^\s]+)/);
          if (match && !resolved) {
            resolved = true;
            cleanup();

            const wsUrl = match[1];
            const portMatch = wsUrl.match(/:(\d+)\//);
            const extractedPort = portMatch ? parseInt(portMatch[1], 10) : 0;

            resolve({ wsUrl, extractedPort });
          }
        };

        const handleError = (error: Error) => {
          if (!resolved) {
            resolved = true;
            cleanup();
            reject(new Error(`Process spawn error: ${error.message}`));
          }
        };

        const handleExit = (
          code: number | null,
          signal: NodeJS.Signals | null,
        ) => {
          this.emit('exit', code, signal);

          if (!resolved) {
            resolved = true;
            cleanup();
            reject(
              new Error(
                `Process exited before inspector URL was found.\n` +
                  `Exit code: ${code}, Signal: ${signal}\n` +
                  `Output: ${combinedOutput}`,
              ),
            );
          }
        };

        // Set up listeners
        process.stdout?.on('data', handleStdout);
        process.stderr?.on('data', handleStderr);
        process.on('error', handleError);
        process.on('exit', handleExit);
      },
    );
  }
}
