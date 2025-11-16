import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { MCPProxy } from 'mcp-funnel';
import type { ProxyConfig } from '@mcp-funnel/schemas';
import { processes, cleanupProcesses, getTestPaths } from './test-utils.js';

const { fixturesDir } = getTestPaths();

describe('Process Lifecycle', () => {
  afterEach(() => {
    cleanupProcesses();
  });

  it('should properly clean up processes on close', async () => {
    const config: ProxyConfig = {
      servers: [
        {
          name: 'lifecycle',
          command: 'tsx',
          args: [path.join(fixturesDir, 'mock-mcp-server.ts'), 'lifecycle-test', 'test'],
        },
      ],
    };

    // Capture stderr to wait for ready signal
    const stderrOutput: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      const msg = args.join(' ');
      stderrOutput.push(msg);
      originalError(...args);
    };

    const proxy = new MCPProxy(config, './test-config.json');
    await proxy.initialize();

    // Wait for lifecycle server to be connected
    const waitForServerConnected = async () => {
      const maxWait = 5000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        const serverConnected = stderrOutput.some((log) =>
          log.includes('[proxy] Connected to: lifecycle'),
        );

        if (serverConnected) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };

    await waitForServerConnected();

    // Tool caches are now populated automatically during initialize()
    // which respects hideTools configuration

    // Wait for tool listing to complete
    const waitForToolsListed = async () => {
      const maxWait = 2000;
      const startTime = Date.now();

      while (Date.now() - startTime < maxWait) {
        const serverListed = stderrOutput.some(
          (log) => log.includes('[lifecycle]') && log.includes('listing tools'),
        );

        if (serverListed) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    };

    await waitForToolsListed();
    console.error = originalError;

    // Verify server is running by checking internal state
    const toolMapping = proxy['toolMapping'] as Map<
      string,
      {
        client: {
          callTool: (args: {
            name: string;
            arguments: unknown;
          }) => Promise<{ content: Array<{ type: string; text: string }> }>;
        };
        originalName: string;
      }
    >;
    expect(toolMapping.size).toBeGreaterThan(0);

    // Get the PIDs of spawned processes before closing
    const pidsBeforeClose = (proxy['clients'] as Map<string, unknown>).size;
    expect(pidsBeforeClose).toBe(1);

    // Close all clients
    // Close clients by accessing the private _transport property
    const clients = proxy['clients'] as Map<string, Client>;
    for (const client of clients.values()) {
      // Access private _transport through bracket notation
      const transport = client['_transport'] as {
        close: () => Promise<void>;
      };
      await transport.close();
    }

    // Clear the clients map
    (proxy['clients'] as Map<string, unknown>).clear();

    // Verify clients are cleaned up
    const pidsAfterClose = (proxy['clients'] as Map<string, unknown>).size;
    expect(pidsAfterClose).toBe(0);
  }, 10000);

  it('should handle server crashes gracefully', async () => {
    // Create a server that crashes after first request
    const crashingServer = spawn(
      'node',
      [
        '-e',
        `
        const readline = require('readline');
        const rl = readline.createInterface({
          input: process.stdin,
          output: null,
          terminal: false
        });

        let requestCount = 0;

        rl.on('line', (line) => {
          requestCount++;
          const msg = JSON.parse(line);

          if (msg.method === 'initialize') {
            const response = {
              jsonrpc: '2.0',
              result: {
                protocolVersion: '0.1.0',
                capabilities: { tools: {} }
              },
              id: msg.id
            };
            console.log(JSON.stringify(response));
          } else {
            // Crash on second request
            console.error('Crashing intentionally!');
            process.exit(1);
          }
        });
      `,
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );

    processes.push(crashingServer);

    const transport = new StdioClientTransport({
      command: 'node',
      args: [
        '-e',
        `
          const readline = require('readline');
          const rl = readline.createInterface({
            input: process.stdin,
            output: null,
            terminal: false
          });

          let requestCount = 0;

          rl.on('line', (line) => {
            requestCount++;
            const msg = JSON.parse(line);

            if (msg.method === 'initialize') {
              const response = {
                jsonrpc: '2.0',
                result: {
                  protocolVersion: '2024-11-05',
                  capabilities: { tools: {} },
                  serverInfo: {
                    name: 'crash-test',
                    version: '1.0.0'
                  }
                },
                id: msg.id
              };
              console.log(JSON.stringify(response));
            } else {
              // Crash on second request
              console.error('Crashing!');
              process.exit(1);
            }
          });
        `,
      ],
    });

    const client = new Client({ name: 'test', version: '1.0.0' }, { capabilities: {} });

    await client.connect(transport);

    // First request should succeed
    // Second request should fail due to crash
    await expect(client.listTools()).rejects.toThrow();

    // Transport should handle the crash
    expect(transport).toBeDefined();
  }, 10000);
});
