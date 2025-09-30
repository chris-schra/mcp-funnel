/**
 * Tests for dev.ts security verification
 * Verifies that all API endpoints are properly protected by authentication
 */

import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { waitForServerReady } from './test-utils.js';
import path from 'node:path';

const tsxPath = path.resolve('node_modules/.bin/tsx');
const cwd = path.resolve('packages/server');

describe('Security Verification', () => {
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

  it('should protect all API endpoints by default', async () => {
    const testToken = randomBytes(32).toString('hex');

    // Start server with auth
    serverProcess = spawn('node', [tsxPath, 'src/dev.ts'], {
      cwd,
      env: {
        ...process.env,
        MCP_FUNNEL_AUTH_TOKEN: testToken,
        PORT: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    testPort = await waitForServerReady(serverProcess);

    // Test various API endpoints require auth
    const endpoints = [
      '/api/health',
      '/api/servers',
      '/api/tools',
      '/api/config',
      '/api/streamable/health',
    ];

    for (const endpoint of endpoints) {
      const noAuthResponse = await fetch(
        `http://localhost:${testPort}${endpoint}`,
      );
      expect(noAuthResponse.status).toBe(401);

      const authResponse = await fetch(
        `http://localhost:${testPort}${endpoint}`,
        {
          headers: {
            Authorization: `Bearer ${testToken}`,
          },
        },
      );
      // Should not be 401 (auth passed, though endpoint might have other issues)
      expect(authResponse.status).not.toBe(401);
    }
  });
});
