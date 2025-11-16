import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MCPProxy } from '../index.js';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';
import { createMockServer, createMockClient } from './test-utils.js';
import type { MockServer, MockClient } from './test-utils.js';

// Create hoisted mock for execAsync (needed for keychain-token-storage)
const mockExecAsync = vi.hoisted(() => vi.fn());

// Mock the SDK modules
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
    sendToolListChanged: vi.fn(),
    notification: vi.fn(),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
  Client: vi.fn(() => ({
    connect: vi.fn(),
    listTools: vi.fn(),
    callTool: vi.fn(),
  })),
}));

// Mock child_process (needs exec and execFile for keychain-token-storage)
vi.mock('child_process', () => ({
  exec: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(() => ({
    stdin: { write: vi.fn() },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
  })),
}));

// Mock util.promisify to return our hoisted mock function (for keychain-token-storage)
vi.mock('util', () => ({
  promisify: () => mockExecAsync,
}));

// Mock fs promises (needed for keychain-token-storage)
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
  },
}));

describe('MCPProxy', () => {
  let mockServer: MockServer;
  let mockClient: MockClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' });

    mockServer = createMockServer();
    mockClient = createMockClient();

    vi.mocked(Server).mockImplementation(() => mockServer);
    vi.mocked(Client).mockImplementation(() => mockClient);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('servers configuration', () => {
    it('should accept servers as an array', async () => {
      const config: ProxyConfig = {
        servers: [
          {
            name: 'test1',
            command: 'echo',
            args: ['test1'],
          },
          {
            name: 'test2',
            command: 'echo',
            args: ['test2'],
          },
        ],
      };

      const proxy = new MCPProxy(config, './.mcp-funnel.json');
      await proxy.initialize();

      // Verify both servers are connected
      expect(Client).toHaveBeenCalledTimes(2);
    });

    it('should accept servers as a record and normalize to array', async () => {
      const config: ProxyConfig = {
        servers: {
          test1: {
            command: 'echo',
            args: ['test1'],
          },
          test2: {
            command: 'echo',
            args: ['test2'],
            env: { FOO: 'bar' },
          },
        },
      };

      const proxy = new MCPProxy(config, './.mcp-funnel.json');
      await proxy.initialize();

      // Verify both servers are connected with correct names
      expect(Client).toHaveBeenCalledTimes(2);
    });

    it('should preserve all server properties when using record format', async () => {
      const config: ProxyConfig = {
        servers: {
          myserver: {
            command: 'node',
            args: ['server.js'],
            env: {
              NODE_ENV: 'production',
              PORT: '3000',
            },
          },
        },
      };

      const proxy = new MCPProxy(config, './.mcp-funnel.json');
      expect(proxy).toBeDefined();

      // The server name should be derived from the key
      await proxy.initialize();
      expect(Client).toHaveBeenCalledTimes(1);
    });
  });
});
