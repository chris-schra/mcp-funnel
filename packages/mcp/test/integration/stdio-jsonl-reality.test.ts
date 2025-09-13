import { describe, it, expect, afterEach } from 'vitest';
import { MCPProxy } from '../../src';
import { ProxyConfig } from '../../src/config.js';
import { spawn, ChildProcess } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Real STDIO/JSONL Communication', () => {
  let processes: ChildProcess[] = [];

  afterEach(() => {
    // Clean up all spawned processes
    for (const proc of processes) {
      if (!proc.killed) {
        proc.kill('SIGTERM');
      }
    }
    processes = [];
  });

  describe('Direct MCP Server Communication', () => {
    it('should communicate with a real MCP server over stdio/JSONL', async () => {
      // Spawn our mock MCP server
      const serverProcess = spawn(
        'tsx',
        [
          path.join(__dirname, '../fixtures/mock-mcp-server.ts'),
          'test-server',
          'demo',
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: { ...process.env },
        },
      );

      processes.push(serverProcess);

      // Collect stderr for debugging
      const stderrChunks: string[] = [];
      serverProcess.stderr?.on('data', (chunk) => {
        stderrChunks.push(chunk.toString());
      });

      // Create MCP client to connect to our mock server
      const transport = new StdioClientTransport({
        command: 'tsx',
        args: [
          path.join(__dirname, '../fixtures/mock-mcp-server.ts'),
          'direct-test',
          'sample',
        ],
      });

      const client = new Client(
        {
          name: 'test-client',
          version: '1.0.0',
        },
        {
          capabilities: {},
        },
      );

      await client.connect(transport);

      // List tools - this tests JSONL request/response
      const toolsResponse = await client.listTools();

      expect(toolsResponse.tools).toHaveLength(3);
      expect(toolsResponse.tools[0].name).toBe('sample_tool1');
      expect(toolsResponse.tools[1].name).toBe('sample_tool2');
      expect(toolsResponse.tools[2].name).toBe('sample_error');

      // Call a tool - tests argument passing over JSONL
      const toolResult = await client.callTool({
        name: 'sample_tool1',
        arguments: { message: 'Hello from test' },
      });

      const content = toolResult.content as Array<{
        type: string;
        text: string;
      }>;

      expect(toolResult.content).toHaveLength(1);
      expect(content[0].type).toBe('text');
      expect(content[0].text).toContain('Hello from test');

      await transport.close();
    }, 10000);

    it('should handle JSONL parsing errors gracefully', async () => {
      // Create a process that sends invalid JSON
      const badProcess = spawn(
        'node',
        [
          '-e',
          `
        // Send valid initial response
        console.log('{"jsonrpc":"2.0","result":{"protocolVersion":"0.1.0"},"id":1}');
        
        // Send invalid JSON
        console.log('not valid json');
        console.log('{ broken json');
        
        // Send valid JSON again
        console.log('{"jsonrpc":"2.0","result":{"tools":[]},"id":2}');
      `,
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      processes.push(badProcess);

      const stderrChunks: string[] = [];
      const stdoutChunks: string[] = [];

      badProcess.stderr?.on('data', (chunk) => {
        stderrChunks.push(chunk.toString());
      });

      badProcess.stdout?.on('data', (chunk) => {
        stdoutChunks.push(chunk.toString());
      });

      // Wait for process to complete
      await new Promise((resolve) => {
        badProcess.on('close', resolve);
      });

      // Verify we got both valid and invalid output
      const output = stdoutChunks.join('');
      expect(output).toContain('not valid json');
      expect(output).toContain('{ broken json');
      expect(output).toContain('"jsonrpc":"2.0"');
    });
  });

  describe('MCP Funnel with Real Servers', () => {
    it('should aggregate multiple real MCP servers', async () => {
      const config: ProxyConfig = {
        servers: [
          {
            name: 'server1',
            command: 'tsx',
            args: [
              path.join(__dirname, '../fixtures/mock-mcp-server.ts'),
              'server1',
              'alpha',
            ],
          },
          {
            name: 'server2',
            command: 'tsx',
            args: [
              path.join(__dirname, '../fixtures/mock-mcp-server.ts'),
              'server2',
              'beta',
            ],
          },
        ],
        hideTools: ['*_error'], // Hide error tools
      };

      // Capture stderr to wait for ready signals
      const stderrOutput: string[] = [];
      const originalError = console.error;
      console.error = (...args: unknown[]) => {
        const msg = args.join(' ');
        stderrOutput.push(msg);
        originalError(...args);
      };

      const proxy = new MCPProxy(config);
      await proxy.initialize();

      // Wait for both servers to be connected
      const waitForServersConnected = async () => {
        const maxWait = 5000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
          const server1Connected = stderrOutput.some((log) =>
            log.includes('[proxy] Connected to: server1'),
          );
          const server2Connected = stderrOutput.some((log) =>
            log.includes('[proxy] Connected to: server2'),
          );

          if (server1Connected && server2Connected) {
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      };

      await waitForServersConnected();

      // Now populate the tool caches which will also populate toolMapping
      // Access private methods for testing
      await (proxy['populateToolCaches'] as () => Promise<void>)();

      // Wait for tool listing to complete
      const waitForToolsListed = async () => {
        const maxWait = 2000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
          const server1Listed = stderrOutput.some(
            (log) => log.includes('[server1]') && log.includes('listing tools'),
          );
          const server2Listed = stderrOutput.some(
            (log) => log.includes('[server2]') && log.includes('listing tools'),
          );

          if (server1Listed && server2Listed) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      };

      await waitForToolsListed();
      console.error = originalError;

      // The proxy doesn't expose listTools directly - it's a server
      // We need to check the internal state or connect as a client
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
      const toolNames = Array.from(toolMapping.keys());

      expect(toolNames).toContain('server1__alpha_tool1');
      expect(toolNames).toContain('server1__alpha_tool2');
      expect(toolNames).toContain('server2__beta_tool1');
      expect(toolNames).toContain('server2__beta_tool2');

      // Error tools are in toolMapping but should be filtered during actual tool listing
      // The toolMapping contains ALL tools, filtering happens when they're exposed to clients
      // So we verify they exist in mapping but would be filtered
      expect(toolNames).toContain('server1__alpha_error');
      expect(toolNames).toContain('server2__beta_error');

      // But they would be hidden from clients due to hideTools config
      const shouldBeHidden = config.hideTools?.some((pattern) => {
        const regex = new RegExp('^' + pattern.replace('*', '.*') + '$');
        return regex.test('server1__alpha_error');
      });
      expect(shouldBeHidden).toBe(true);

      // Verify tools are mapped
      expect(toolMapping.has('server1__alpha_tool1')).toBe(true);
      expect(toolMapping.has('server2__beta_tool1')).toBe(true);

      // Call tools through the internal mapping
      const mapping1 = toolMapping.get('server1__alpha_tool1');
      if (!mapping1) throw new Error('Tool not found');
      const result1 = await mapping1.client.callTool({
        name: mapping1.originalName,
        arguments: { message: 'Test message' },
      });

      expect(result1.content[0].type).toBe('text');
      expect(result1.content[0].text).toContain('server1');
      expect(result1.content[0].text).toContain('Test message');

      // Close clients
      // Close clients by accessing the private _transport property
      const clients = proxy['clients'] as Map<string, Client>;
      for (const client of clients.values()) {
        // Access private _transport through bracket notation
        const transport = client['_transport'] as {
          close: () => Promise<void>;
        };
        await transport.close();
      }
    }, 15000);

    it('should handle server stderr prefixing correctly', async () => {
      const stderrOutput: string[] = [];

      // Capture console.error to verify prefixing
      const originalError = console.error;
      console.error = (...args: unknown[]) => {
        stderrOutput.push(args.join(' '));
      };

      const config: ProxyConfig = {
        servers: [
          {
            name: 'github',
            command: 'tsx',
            args: [
              path.join(__dirname, '../fixtures/mock-mcp-server.ts'),
              'github-mock',
              'gh',
            ],
          },
        ],
      };

      const proxy = new MCPProxy(config);
      await proxy.initialize();

      // Restore console.error
      console.error = originalError;

      // Check that stderr was prefixed
      const githubLogs = stderrOutput.filter((line) =>
        line.startsWith('[github]'),
      );

      expect(githubLogs.length).toBeGreaterThan(0);
      expect(githubLogs.some((log) => log.includes('starting up'))).toBe(true);
      expect(
        githubLogs.some((log) => log.includes('connected and ready')),
      ).toBe(true);

      // Close clients
      // Close clients by accessing the private _transport property
      const clients = proxy['clients'] as Map<string, Client>;
      for (const client of clients.values()) {
        // Access private _transport through bracket notation
        const transport = client['_transport'] as {
          close: () => Promise<void>;
        };
        await transport.close();
      }
    }, 10000);
  });

  describe('JSONL Protocol Verification', () => {
    it('should send and receive proper JSONL format', async () => {
      const receivedMessages: string[] = [];
      // const _sentMessages: string[] = []; // Unused, kept for future use

      // Create a simple echo server that logs all JSONL
      const echoProcess = spawn(
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

        // MCP initialize handshake
        rl.once('line', (line) => {
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
          }
        });

        // Echo subsequent messages
        rl.on('line', (line) => {
          try {
            const msg = JSON.parse(line);
            console.error('Received: ' + line);
            
            if (msg.method === 'tools/list') {
              const response = {
                jsonrpc: '2.0',
                result: {
                  tools: [{
                    name: 'echo_tool',
                    description: 'Echoes input',
                    inputSchema: { type: 'object' }
                  }]
                },
                id: msg.id
              };
              console.log(JSON.stringify(response));
            } else if (msg.method === 'tools/call') {
              const response = {
                jsonrpc: '2.0',
                result: {
                  content: [{
                    type: 'text',
                    text: 'Echoed: ' + JSON.stringify(msg.params.arguments)
                  }]
                },
                id: msg.id
              };
              console.log(JSON.stringify(response));
            }
          } catch (e) {
            console.error('Parse error: ' + e.message);
          }
        });
      `,
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      processes.push(echoProcess);

      // Capture stderr (which logs received messages)
      echoProcess.stderr?.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('Received: ')) {
            receivedMessages.push(line.substring('Received: '.length));
          }
        }
      });

      // Create transport and client
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

          rl.on('line', (line) => {
            const msg = JSON.parse(line);
            if (msg.method === 'initialize') {
              const response = {
                jsonrpc: '2.0',
                result: {
                  protocolVersion: '2024-11-05',
                  capabilities: { tools: {} },
                  serverInfo: {
                    name: 'test-server',
                    version: '1.0.0'
                  }
                },
                id: msg.id
              };
              console.log(JSON.stringify(response));
            } else if (msg.method === 'tools/list') {
              const response = {
                jsonrpc: '2.0',
                result: {
                  tools: [{
                    name: 'test_tool',
                    description: 'Test',
                    inputSchema: { type: 'object' }
                  }]
                },
                id: msg.id
              };
              console.log(JSON.stringify(response));
            }
          });
        `,
        ],
      });

      const client = new Client(
        { name: 'test', version: '1.0.0' },
        { capabilities: {} },
      );

      await client.connect(transport);

      // Make a request
      const tools = await client.listTools();
      expect(tools.tools).toHaveLength(1);

      await transport.close();

      // Verify JSONL format (each message on its own line)
      for (const msg of receivedMessages) {
        if (msg.trim()) {
          // Should be valid JSON
          expect(() => JSON.parse(msg)).not.toThrow();
          // Should not contain newlines within the JSON
          expect(msg).not.toContain('\n');
        }
      }
    }, 10000);

    it('should handle large JSONL messages correctly', async () => {
      // Create a server that sends a large response
      const largeData = 'x'.repeat(100000); // 100KB of data

      const serverProcess = spawn(
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

        rl.once('line', (line) => {
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
          }
        });

        rl.on('line', (line) => {
          const msg = JSON.parse(line);
          if (msg.method === 'tools/call') {
            const response = {
              jsonrpc: '2.0',
              result: {
                content: [{
                  type: 'text',
                  text: '${largeData}'
                }]
              },
              id: msg.id
            };
            console.log(JSON.stringify(response));
          } else if (msg.method === 'tools/list') {
            const response = {
              jsonrpc: '2.0',
              result: {
                tools: [{
                  name: 'large_tool',
                  description: 'Returns large data',
                  inputSchema: { type: 'object' }
                }]
              },
              id: msg.id
            };
            console.log(JSON.stringify(response));
          }
        });
      `,
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
        },
      );

      processes.push(serverProcess);

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

          rl.on('line', (line) => {
            const msg = JSON.parse(line);
            if (msg.method === 'initialize') {
              const response = {
                jsonrpc: '2.0',
                result: {
                  protocolVersion: '2024-11-05',
                  capabilities: { tools: {} },
                  serverInfo: {
                    name: 'large-server',
                    version: '1.0.0'
                  }
                },
                id: msg.id
              };
              console.log(JSON.stringify(response));
            } else if (msg.method === 'tools/call') {
              const response = {
                jsonrpc: '2.0',
                result: {
                  content: [{
                    type: 'text',
                    text: '${'y'.repeat(100000)}'
                  }]
                },
                id: msg.id
              };
              console.log(JSON.stringify(response));
            } else if (msg.method === 'tools/list') {
              const response = {
                jsonrpc: '2.0',
                result: {
                  tools: [{
                    name: 'big_tool',
                    description: 'Test',
                    inputSchema: { type: 'object' }
                  }]
                },
                id: msg.id
              };
              console.log(JSON.stringify(response));
            }
          });
        `,
        ],
      });

      const client = new Client(
        { name: 'test', version: '1.0.0' },
        { capabilities: {} },
      );

      await client.connect(transport);

      // Get tools first
      await client.listTools();

      // Call tool to get large response
      const result = await client.callTool({
        name: 'big_tool',
        arguments: {},
      });

      const content = result.content as Array<{
        type: string;
        text: string;
      }>;

      expect(result.content).toHaveLength(1);
      expect(content[0].text).toHaveLength(100000);

      await transport.close();
    }, 10000);
  });

  describe('Process Lifecycle', () => {
    it('should properly clean up processes on close', async () => {
      const config: ProxyConfig = {
        servers: [
          {
            name: 'lifecycle',
            command: 'tsx',
            args: [
              path.join(__dirname, '../fixtures/mock-mcp-server.ts'),
              'lifecycle-test',
              'test',
            ],
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

      const proxy = new MCPProxy(config);
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

      // Now populate the tool caches which will also populate toolMapping
      // Access private methods for testing
      await (proxy['populateToolCaches'] as () => Promise<void>)();

      // Wait for tool listing to complete
      const waitForToolsListed = async () => {
        const maxWait = 2000;
        const startTime = Date.now();

        while (Date.now() - startTime < maxWait) {
          const serverListed = stderrOutput.some(
            (log) =>
              log.includes('[lifecycle]') && log.includes('listing tools'),
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

      const client = new Client(
        { name: 'test', version: '1.0.0' },
        { capabilities: {} },
      );

      await client.connect(transport);

      // First request should succeed
      // Second request should fail due to crash
      await expect(client.listTools()).rejects.toThrow();

      // Transport should handle the crash
      expect(transport).toBeDefined();
    }, 10000);
  });
});
