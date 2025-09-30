import { promises as fs } from 'fs';
import http from 'http';

/**
 * Node.js Inspector utilities for discovering and managing inspector connections
 */

export interface InspectorTarget {
  id: string;
  title: string;
  type: 'node';
  url: string;
  webSocketDebuggerUrl: string;
  devtoolsFrontendUrl?: string;
}

/**
 * Discover Node.js inspector targets on a given port
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
 * Find available port for Node.js inspector
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
 * Check if a port is available
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
 * Validate Node.js script path
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
 * Parse Node.js inspector WebSocket URL from output
 */
export function parseInspectorUrl(output: string): string | null {
  const wsRegex = /Debugger listening on (ws:\/\/[^\s]+)/;
  const match = output.match(wsRegex);
  return match ? match[1] : null;
}

/**
 * Wait for condition with timeout
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
