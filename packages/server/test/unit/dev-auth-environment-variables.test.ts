/**
 * Tests for dev.ts authentication behavior with environment variables
 * Verifies that mandatory authentication is properly implemented in the development server
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { waitForServerReady } from './test-utils.js';
import path from 'node:path';

const tsxPath = path.resolve('node_modules/.bin/tsx');
const cwd = path.resolve('packages/server');

describe('Default Authentication with Environment Variables', () => {
  let serverProcess: ChildProcess | null = null;
  let testPort: number;

  beforeEach(async () => {
    // Verify no lingering tsx processes from previous tests
    await new Promise<void>((resolve) => {
      let psCheck: ChildProcess;
      try {
        psCheck = spawn('ps', ['aux']);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.debug(
          `Skipping lingering tsx dev.ts process check: ${message}`,
        );
        resolve();
        return;
      }

      let resolved = false;
      let output = '';

      const cleanup = () => {
        psCheck.stdout?.off('data', onData);
        psCheck.off('exit', onExit);
        psCheck.off('error', onError);
      };

      const resolveOnce = (handler: () => void) => {
        if (resolved) {
          return;
        }
        resolved = true;
        cleanup();
        handler();
      };

      const onData = (data: Buffer) => {
        output += data.toString();
      };

      const onExit = () => {
        resolveOnce(() => {
          const tsxProcesses = output
            .split('\n')
            .filter(
              (line) => line.includes('tsx') && line.includes('dev.ts'),
            ).length;

          if (tsxProcesses > 0) {
            console.warn(
              `Found ${tsxProcesses} lingering tsx dev.ts processes before test`,
            );
          }

          resolve();
        });
      };

      const onError = (error: Error) => {
        resolveOnce(() => {
          console.debug(
            `Skipping lingering tsx dev.ts process check: ${error.message}`,
          );
          resolve();
        });
      };

      psCheck.stdout?.on('data', onData);
      psCheck.once('exit', onExit);
      psCheck.once('error', onError);
    });
  });

  afterEach(async () => {
    if (serverProcess) {
      const pid = serverProcess.pid;
      const isProcessAlive = () => {
        if (!pid) return false;
        try {
          // This will throw if process doesn't exist
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };

      // Check if process is still alive before trying to kill it
      if (isProcessAlive()) {
        // Set up exit listener BEFORE sending kill signal to avoid race condition
        const exitPromise = new Promise<void>((resolve) => {
          if (serverProcess) {
            serverProcess.on('exit', (code, signal) => {
              console.debug(
                `Process ${pid} exited with code ${code}, signal ${signal}`,
              );
              resolve();
            });

            // Also handle error events
            serverProcess.on('error', (error) => {
              console.debug(`Process ${pid} error: ${error.message}`);
              resolve();
            });
          } else {
            resolve();
          }
        });

        // Now send the kill signal
        try {
          serverProcess.kill('SIGTERM');
        } catch (error) {
          console.debug(`Error sending SIGTERM to process ${pid}: ${error}`);
        }

        // Wait for process to exit with timeout
        const timeoutPromise = new Promise<void>((resolve) => {
          setTimeout(() => {
            if (serverProcess && pid && isProcessAlive()) {
              console.debug(`Force killing process ${pid} after timeout`);
              try {
                serverProcess.kill('SIGKILL');
              } catch (error) {
                console.debug(`Error force killing process ${pid}: ${error}`);
              }
            }
            resolve();
          }, 2000);
        });

        // Wait for either exit or timeout
        await Promise.race([exitPromise, timeoutPromise]);
      } else {
        console.debug(`Process ${pid} already terminated`);
      }

      // Final verification that process is terminated
      if (pid && isProcessAlive()) {
        console.warn(`Process ${pid} still exists after cleanup attempt`);
      } else {
        console.debug(`Process ${pid} successfully terminated`);
      }

      serverProcess = null;
    }
  });

  it('should use MCP_FUNNEL_AUTH_TOKEN when provided', async () => {
    const testToken = randomBytes(32).toString('hex');

    // Start server with explicit auth token
    serverProcess = spawn('node', [tsxPath, 'src/dev.ts'], {
      cwd,
      env: {
        ...process.env,
        MCP_FUNNEL_AUTH_TOKEN: testToken,
        PORT: '0', // Use dynamic port
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    testPort = await waitForServerReady(serverProcess);

    // Test that auth is required
    const noAuthResponse = await fetch(
      `http://localhost:${testPort}/api/health`,
    );
    expect(noAuthResponse.status).toBe(401);

    // Test that correct token works
    const authResponse = await fetch(
      `http://localhost:${testPort}/api/health`,
      {
        headers: {
          Authorization: `Bearer ${testToken}`,
        },
      },
    );
    expect(authResponse.status).toBe(200);
  });

  it('should generate random token when MCP_FUNNEL_AUTH_TOKEN not provided', async () => {
    let capturedOutput = '';

    // Start server without auth token
    serverProcess = spawn('node', [tsxPath, 'src/dev.ts'], {
      cwd,
      env: {
        ...process.env,
        PORT: '0', // Use dynamic port
        // Explicitly unset MCP_FUNNEL_AUTH_TOKEN
        MCP_FUNNEL_AUTH_TOKEN: undefined,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Capture output to find generated token
    serverProcess.stdout?.on('data', (data) => {
      capturedOutput += data.toString();
    });
    serverProcess.stderr?.on('data', (data) => {
      capturedOutput += data.toString();
    });

    testPort = await waitForServerReady(serverProcess);

    // Extract generated token from output
    const tokenMatch = capturedOutput.match(/Bearer Token: ([a-f0-9]{64})/);
    expect(tokenMatch).toBeTruthy();
    expect(tokenMatch![1]).toHaveLength(64); // 32 bytes = 64 hex chars

    const generatedToken = tokenMatch![1];

    // Test that auth is required
    const noAuthResponse = await fetch(
      `http://localhost:${testPort}/api/health`,
    );
    expect(noAuthResponse.status).toBe(401);

    // Test that generated token works
    const authResponse = await fetch(
      `http://localhost:${testPort}/api/health`,
      {
        headers: {
          Authorization: `Bearer ${generatedToken}`,
        },
      },
    );
    expect(authResponse.status).toBe(200);
  });

  it('should allow opt-out with DISABLE_INBOUND_AUTH=true', async () => {
    let capturedOutput = '';

    // Start server with auth disabled
    serverProcess = spawn('node', [tsxPath, 'src/dev.ts'], {
      cwd,
      env: {
        ...process.env,
        DISABLE_INBOUND_AUTH: 'true',
        PORT: '0', // Use dynamic port
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Capture output to verify warnings
    serverProcess.stdout?.on('data', (data) => {
      capturedOutput += data.toString();
    });
    serverProcess.stderr?.on('data', (data) => {
      capturedOutput += data.toString();
    });

    testPort = await waitForServerReady(serverProcess);

    // Verify security warnings are displayed
    expect(capturedOutput).toContain(
      'WARNING: Inbound authentication is DISABLED',
    );
    expect(capturedOutput).toContain('This is a security risk');

    // Test that no auth is required
    const noAuthResponse = await fetch(
      `http://localhost:${testPort}/api/health`,
    );
    expect(noAuthResponse.status).toBe(200);
  });

  it('should reject short auth tokens', async () => {
    const shortToken = 'short'; // Less than 16 characters

    // Start server with short token - should fail
    serverProcess = spawn('node', [tsxPath, 'src/dev.ts'], {
      cwd,
      env: {
        ...process.env,
        MCP_FUNNEL_AUTH_TOKEN: shortToken,
        PORT: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Server should exit with error
    await new Promise<void>((resolve, reject) => {
      let output = '';

      serverProcess!.stdout?.on('data', (data) => {
        output += data.toString();
      });
      serverProcess!.stderr?.on('data', (data) => {
        output += data.toString();
      });

      serverProcess!.on('exit', (code) => {
        if (code === 1) {
          expect(output).toContain('must be at least 16 characters long');
          resolve();
        } else {
          reject(new Error(`Expected exit code 1, got ${code}`));
        }
      });

      // Timeout
      setTimeout(() => {
        reject(new Error('Process did not exit as expected'));
      }, 5000);
    });
  });
});
