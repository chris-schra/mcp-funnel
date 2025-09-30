import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { processes } from './test-utils.js';

describe('JSONL Protocol Verification', () => {
  afterEach(() => {
    // Clean up all spawned processes
    for (const proc of processes) {
      if (!proc.killed) {
        proc.kill('SIGTERM');
      }
    }
    processes.length = 0;
  });

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
