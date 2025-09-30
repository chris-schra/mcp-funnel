import { promises as fs } from 'fs';
import http from 'http';

/**
 * Node.js Inspector target metadata from /json endpoint.
 *
 * Represents a debuggable Node.js process as reported by the inspector protocol.
 * @public
 * @see file:../adapters/node/connection-manager.ts - Usage in connection establishment
 */
export interface InspectorTarget {
  /** Unique identifier for the target */
  id: string;
  /** Human-readable target name (usually the script path) */
  title: string;
  /** Target type - always 'node' for Node.js processes */
  type: 'node';
  /** HTTP URL for the inspector endpoint */
  url: string;
  /** WebSocket URL for CDP connection */
  webSocketDebuggerUrl: string;
  /** Optional DevTools frontend URL */
  devtoolsFrontendUrl?: string;
}

/**
 * Discovers Node.js inspector targets on a given port.
 *
 * Queries the inspector's /json endpoint to retrieve all debuggable Node.js processes.
 * Filters results to include only targets of type 'node'.
 * @param port - Inspector port to query
 * @param host - Inspector host address
 * @returns Promise resolving to array of Node.js inspector targets
 * @throws When the HTTP request fails, times out (\>2s), or response parsing fails
 * @example
 * ```typescript
 * // Discover targets on default port
 * const targets = await discoverInspectorTargets();
 * console.log(targets[0].webSocketDebuggerUrl);
 * ```
 * @public
 * @see file:../adapters/node/connection-manager.ts - Target discovery in adapters
 */
export async function discoverInspectorTargets(
  port = 9229,
  host = 'localhost',
): Promise<InspectorTarget[]> {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://${host}:${port}/json`, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          const targets = JSON.parse(data) as InspectorTarget[];
          resolve(targets.filter((target) => target.type === 'node'));
        } catch (error) {
          reject(
            new Error(
              `Failed to parse inspector targets: ${error instanceof Error ? error.message : 'Unknown error'}`,
            ),
          );
        }
      });
    });

    request.on('error', (error) => {
      reject(
        new Error(`Failed to discover inspector targets: ${error.message}`),
      );
    });

    request.setTimeout(2000, () => {
      request.destroy();
      reject(new Error('Timeout discovering inspector targets'));
    });
  });
}

/**
 * Finds an available port for Node.js inspector in the specified range.
 *
 * Sequentially tests ports by attempting to bind a temporary HTTP server.
 * Returns the first port that successfully binds and closes cleanly.
 * @param startPort - First port in range to test
 * @param endPort - Last port in range to test (inclusive)
 * @returns Promise resolving to first available port number
 * @throws When no ports are available in the specified range
 * @example
 * ```typescript
 * // Find port in default range (9229-9239)
 * const port = await findAvailablePort();
 * console.log(`Using inspector port: ${port}`);
 * ```
 * @public
 */
export async function findAvailablePort(
  startPort = 9229,
  endPort = 9239,
): Promise<number> {
  for (let port = startPort; port <= endPort; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available ports in range ${startPort}-${endPort}`);
}

/**
 * Checks if a port is available by attempting to bind an HTTP server.
 * @param port - Port number to test
 * @returns Promise resolving to true if port is available, false if in use
 * @internal
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = http.createServer();

    server.listen(port, () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.on('error', () => {
      resolve(false);
    });
  });
}

/**
 * Validates that a path points to an executable JavaScript/TypeScript file.
 *
 * Performs three checks:
 * 1. Path exists and is a file (not directory)
 * 2. Extension is .js, .ts, .mjs, or .cjs (case-insensitive)
 * 3. If path contains spaces, checks if arguments were incorrectly embedded
 *
 * If the path contains spaces and doesn't exist, the validator attempts to extract
 * a base path and provides a helpful error message directing users to use the
 * separate `args` parameter for script arguments.
 * @param scriptPath - File path to validate
 * @throws When path doesn't exist, isn't a file, has wrong extension, or contains embedded arguments
 * @example
 * ```typescript
 * // Valid paths
 * await validateScriptPath('./script.js');
 * await validateScriptPath('/path/to/app.ts');
 *
 * // Invalid - will throw
 * await validateScriptPath('./script.js --arg'); // Use args parameter instead
 * ```
 * @public
 * @see file:../handlers/debug-handler.ts - Used during debug session initialization
 */
export async function validateScriptPath(scriptPath: string): Promise<void> {
  try {
    const stat = await fs.stat(scriptPath);
    if (!stat.isFile()) {
      throw new Error('Path is not a file');
    }

    // Check if it's a JavaScript file
    if (!scriptPath.match(/\.(js|ts|mjs|cjs)$/i)) {
      throw new Error('File is not a JavaScript/TypeScript file');
    }
  } catch (error) {
    if (error instanceof Error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        if (scriptPath.includes(' ')) {
          const [potentialPath] = scriptPath.split(' ');
          try {
            const potentialStat = await fs.stat(potentialPath);
            if (potentialStat.isFile()) {
              throw new Error(
                `Script file not found: ${scriptPath}. The path appears to include additional arguments. Pass the script via "target" and provide extra arguments using the "args" option.`,
              );
            }
          } catch (_innerError) {
            // Ignore secondary stat errors and fall through to default message
          }
        }
        throw new Error(`Script file not found: ${scriptPath}`);
      }
      throw error;
    }
    throw new Error(`Failed to validate script path: ${scriptPath}`);
  }
}

/**
 * Parses Node.js inspector WebSocket URL from process output.
 *
 * Searches for the "Debugger listening on ws://..." message that Node.js
 * emits when inspector is enabled. This message appears in stderr when
 * Node is started with --inspect or --inspect-brk flags.
 * @param output - Process output text (typically stderr)
 * @returns WebSocket URL if found, null otherwise
 * @example
 * ```typescript
 * const stderr = 'Debugger listening on ws://127.0.0.1:9229/abc-123';
 * const url = parseInspectorUrl(stderr);
 * // Returns: 'ws://127.0.0.1:9229/abc-123'
 * ```
 * @public
 * @see file:../adapters/node/process-spawner.ts - Used to extract inspector URL from spawned Node process
 */
export function parseInspectorUrl(output: string): string | null {
  const wsRegex = /Debugger listening on (ws:\/\/[^\s]+)/;
  const match = output.match(wsRegex);
  return match ? match[1] : null;
}

/**
 * Waits for a condition to become truthy with timeout and polling.
 *
 * Repeatedly evaluates the condition function at fixed intervals until it
 * returns a non-null value or the timeout is reached. Exceptions during
 * condition evaluation are caught and polling continues.
 *
 * This utility swallows errors from the condition function to allow transient
 * failures during polling. Only timeout errors are propagated to the caller.
 * @typeParam T - The type of value returned when condition is satisfied
 * @param condition - Function that returns the awaited value or null if not ready
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @param intervalMs - Time between condition checks in milliseconds
 * @returns Promise resolving to the non-null value returned by condition
 * @throws When timeout is reached before condition returns non-null value
 * @example
 * ```typescript
 * // Wait for inspector URL to appear in logs
 * const url = await waitForCondition(
 *   () => parseInspectorUrl(processOutput),
 *   5000,
 *   100
 * );
 * ```
 * @public
 */
export function waitForCondition<T>(
  condition: () => Promise<T | null> | T | null,
  timeoutMs = 5000,
  intervalMs = 100,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = async () => {
      try {
        const result = await condition();
        if (result !== null) {
          resolve(result);
          return;
        }
      } catch (_error) {
        // Continue checking unless timeout is reached
      }

      if (Date.now() - startTime >= timeoutMs) {
        reject(new Error('Timeout waiting for condition'));
        return;
      }

      setTimeout(check, intervalMs);
    };

    check();
  });
}
