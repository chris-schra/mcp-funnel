import { describe, it, expect, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import path from 'path';
import { MCPProxy } from 'mcp-funnel';
import type { ProxyConfig } from '@mcp-funnel/schemas';
import { cleanupProcesses, getTestPaths } from './test-utils.js';

const { __dirname } = getTestPaths();

describe('MCP Funnel with Real Servers', () => {
  afterEach(() => {
    cleanupProcesses();
  });

  it('should aggregate multiple real MCP servers', async () => {
    const config: ProxyConfig = {
      servers: [
        {
          name: 'server1',
          command: 'tsx',
          args: [path.join(__dirname, '../../fixtures/mock-mcp-server.ts'), 'server1', 'alpha'],
        },
        {
          name: 'server2',
          command: 'tsx',
          args: [path.join(__dirname, '../../fixtures/mock-mcp-server.ts'), 'server2', 'beta'],
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

    const proxy = new MCPProxy(config, './test-config.json');
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

    // Tool caches are now populated automatically during initialize()
    // which respects hideTools configuration

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

    // Error tools are completely blocked by hideTools (firewall behavior)
    // They should NOT be in toolMapping at all
    expect(toolNames).not.toContain('server1__alpha_error');
    expect(toolNames).not.toContain('server2__beta_error');

    // Verify that hideTools pattern would match these tools
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
          args: [path.join(__dirname, '../../fixtures/mock-mcp-server.ts'), 'github-mock', 'gh'],
        },
      ],
    };

    const proxy = new MCPProxy(config, './test-config.json');
    await proxy.initialize();

    // Restore console.error
    console.error = originalError;

    // Check that stderr was prefixed
    const githubLogs = stderrOutput.filter((line) => line.startsWith('[github]'));

    expect(githubLogs.length).toBeGreaterThan(0);
    expect(githubLogs.some((log) => log.includes('starting up'))).toBe(true);
    expect(githubLogs.some((log) => log.includes('connected and ready'))).toBe(true);

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
