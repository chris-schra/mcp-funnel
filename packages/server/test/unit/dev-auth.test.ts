/**
 * Tests for dev.ts authentication behavior
 * Verifies that mandatory authentication is properly implemented in the development server
 */

import { describe, it, expect, afterEach } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';

// Helper to wait for server to be ready
const waitForServerReady = (
  child: ChildProcess,
  timeout = 10000,
): Promise<number> => {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      reject(new Error('Server startup timeout'));
    }, timeout);

    const onData = (data: Buffer) => {
      output += data.toString();
      // Look for server ready message with port
      const match = output.match(/Web UI server running at.*:(\d+)/);
      if (match) {
        clearTimeout(timer);
        child.stdout?.off('data', onData);
        child.stderr?.off('data', onData);
        resolve(parseInt(match[1], 10));
      }
    };

    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on('exit', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Server exited with code ${code}`));
      }
    });
  });
};

describe('Development Server Mandatory Authentication', () => {
  let serverProcess: ChildProcess | null = null;
  let testPort: number;

  afterEach(async () => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      // Wait for process to exit
      await new Promise<void>((resolve) => {
        if (serverProcess) {
          serverProcess.on('exit', () => {
            resolve();
          });
          // Force kill if it doesn't exit gracefully
          setTimeout(() => {
            if (serverProcess && !serverProcess.killed) {
              serverProcess.kill('SIGKILL');
            }
            resolve();
          }, 2000);
        } else {
          resolve();
        }
      });
      serverProcess = null;
    }
  });

  describe('Default Authentication with Environment Variables', () => {
    it('should use MCP_FUNNEL_AUTH_TOKEN when provided', async () => {
      const testToken = randomBytes(32).toString('hex');

      // Start server with explicit auth token
      serverProcess = spawn('tsx', ['src/dev.ts'], {
        cwd: '/Users/d635861/WorkBench/mcp-funnel/mcp-funnel-oauth/packages/server',
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
      serverProcess = spawn('tsx', ['src/dev.ts'], {
        cwd: '/Users/d635861/WorkBench/mcp-funnel/mcp-funnel-oauth/packages/server',
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
      serverProcess = spawn('tsx', ['src/dev.ts'], {
        cwd: '/Users/d635861/WorkBench/mcp-funnel/mcp-funnel-oauth/packages/server',
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
      serverProcess = spawn('tsx', ['src/dev.ts'], {
        cwd: '/Users/d635861/WorkBench/mcp-funnel/mcp-funnel-oauth/packages/server',
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

  describe('Security Verification', () => {
    it('should protect all API endpoints by default', async () => {
      const testToken = randomBytes(32).toString('hex');

      // Start server with auth
      serverProcess = spawn('tsx', ['src/dev.ts'], {
        cwd: '/Users/d635861/WorkBench/mcp-funnel/mcp-funnel-oauth/packages/server',
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
});
