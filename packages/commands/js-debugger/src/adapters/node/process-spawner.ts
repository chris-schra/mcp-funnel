import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Configuration options for spawning Node.js processes with inspector.
 * @public
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
 * Result of successful process spawn operation.
 * @public
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
 * Process output stream data emitted via the 'output' event.
 * @public
 */
export interface ProcessOutput {
  type: 'stdout' | 'stderr';
  data: Buffer;
  text: string;
}

/**
 * Node.js process spawner with Chrome DevTools Protocol inspector support.
 *
 * Spawns Node.js processes with --inspect-brk flag and extracts the WebSocket
 * debugger URL from stderr output, enabling CDP-based debugging. Always uses
 * 'node' as the runtime command regardless of the `command` option value.
 *
 * Emits 'output' events with {@link ProcessOutput} data for monitoring process
 * stdout/stderr, and 'exit' events when the spawned process terminates.
 * @example Basic usage with default options
 * ```typescript
 * const spawner = new ProcessSpawner();
 *
 * // Spawn with default options (random port, stop on entry)
 * const result = await spawner.spawn('./my-script.js');
 * console.log(`Process spawned: ${result.process.pid}`);
 * console.log(`WebSocket URL: ${result.wsUrl}`);
 *
 * // Connect to the CDP debugger using result.wsUrl
 * await cdpClient.connect(result.wsUrl);
 *
 * // Clean up when done
 * await spawner.kill(result.process);
 * ```
 * @example With custom options
 * ```typescript
 * const spawner = new ProcessSpawner();
 *
 * // Monitor process output
 * spawner.on('output', (output) => {
 *   if (output.type === 'stderr') {
 *     console.error('Process stderr:', output.text);
 *   }
 * });
 *
 * // Spawn with specific port and additional Node.js arguments
 * const result = await spawner.spawn('./my-script.js', {
 *   port: 9229,
 *   args: ['--enable-source-maps', '--max-old-space-size=2048'],
 *   env: { NODE_ENV: 'development' },
 *   timeoutMs: 5000
 * });
 * ```
 * @see file:./connection-manager.ts:135 - Usage in ConnectionManager
 * @public
 */
export class ProcessSpawner extends EventEmitter {
  /**
   * Spawns a Node.js process with inspector enabled and extracts CDP WebSocket URL.
   *
   * Always uses 'node' as the runtime command and --inspect-brk flag to pause execution
   * at the first statement. The command option is accepted but ignored - use the args
   * option to pass runtime flags like --import for tsx support.
   *
   * Listens to stderr for the inspector URL pattern "Debugger listening on ws://..."
   * and resolves once found. If the process exits or the timeout is reached before
   * the URL is extracted, the promise rejects and the process is cleaned up.
   * @param {string} target - Script file path to execute (absolute or relative)
   * @param {SpawnOptions} options - Spawn configuration options (port, args, env, timeout)
   * @returns {Promise<SpawnResult>} Promise resolving to spawn result with process handle, WebSocket URL, and port
   * @throws {Error} When inspector URL extraction times out after timeoutMs milliseconds
   * @throws {Error} When process spawning fails (invalid script path, permission denied, etc.)
   * @throws {Error} When process exits before inspector URL is found
   * @public
   */
  public async spawn(
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
   * Terminates a spawned process gracefully with automatic fallback to force kill.
   *
   * Sends SIGTERM for graceful shutdown and waits for process exit. If the process
   * does not exit within timeoutMs, sends SIGKILL to force termination. Safe to call
   * on already-terminated processes (no-op if process.killed is true or exitCode is set).
   * @param {ChildProcess} process - Child process to terminate
   * @param {number} timeoutMs - Timeout in milliseconds before forcing SIGKILL (default: 2000ms)
   * @returns {Promise<void>} Promise resolving when the process has exited or been killed
   * @public
   */
  public async kill(process: ChildProcess, timeoutMs = 2000): Promise<void> {
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
   * Builds runtime arguments for spawning the Node.js process with inspector.
   *
   * Always constructs --inspect-brk argument (uses port 0 for random port selection)
   * and ignores the command parameter, always returning 'node' as runtime. This method
   * exists as a protected seam for testing scenarios where inspector behavior needs
   * to be overridden.
   * @param {string} command - Requested command (currently ignored, always uses 'node')
   * @param {number} port - Inspector port number (0 for random port)
   * @param {string[]} userArgs - Additional Node.js runtime arguments to include
   * @returns {{ runtime: string; runtimeArgs: string[] }} Object containing runtime command ('node') and complete argument array
   * @internal
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
   * Extracts inspector WebSocket URL from spawned process stderr output.
   *
   * Monitors both stdout and stderr streams, looking for the pattern
   * "Debugger listening on ws://..." which Node.js emits to stderr when
   * the inspector is ready. Emits 'output' events for all stdout/stderr
   * data and 'exit' event if the process terminates.
   * @param {ChildProcess} process - Spawned ChildProcess with inspector enabled
   * @param {number} timeoutMs - Maximum time to wait for inspector URL in milliseconds
   * @returns {Promise<{ wsUrl: string; extractedPort: number }>} Promise resolving to object with WebSocket URL and extracted port number
   * @throws {Error} When timeout is reached before URL is found
   * @throws {Error} When process encounters spawn error
   * @throws {Error} When process exits before URL is extracted
   * @internal
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
