import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import path from 'path';
import { processes, cleanupProcesses, getTestPaths } from './test-utils.js';

const { __dirname } = getTestPaths();

describe('Direct MCP Server Communication', () => {
  afterEach(() => {
    cleanupProcesses();
  });

  it('should communicate with a real MCP server over stdio/JSONL', async () => {
    // Spawn our mock MCP server
    const serverProcess = spawn(
      'tsx',
      [
        path.join(__dirname, '../../fixtures/mock-mcp-server.ts'),
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
        path.join(__dirname, '../../fixtures/mock-mcp-server.ts'),
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
