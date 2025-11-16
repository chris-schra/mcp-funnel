/**
 * Tests for full registry flow: Search → Get Details → Generate Config
 */

import { describe, it, expect } from 'vitest';
import {
  RegistryContext,
  setupRegistryIntegrationTest,
  type ServerDetail,
  type KeyValueInput,
} from './test-utils.js';

describe('Registry Integration Tests', () => {
  const { mockProxyConfig, mockFetch } = setupRegistryIntegrationTest();

  describe('Full Flow: Search → Get Details → Generate Config', () => {
    it('should complete full flow for NPM package server', async () => {
      // Mock search response with NPM server
      const npmServerDetail: ServerDetail = {
        id: 'npm-example-server',
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            id: 'npm-example-registry-id',
            published_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        },
        name: 'NPM Example Server',
        description: 'Example MCP server from NPM registry',
        packages: [
          {
            identifier: '@mcp/example-server',
            registry_type: 'npm',
            runtime_hint: 'node',
            package_arguments: ['--config', 'production.json'],
            environment_variables: [
              { name: 'NODE_ENV', value: 'production', is_required: false },
              { name: 'API_KEY', is_required: true },
            ],
          },
        ],
        tools: ['file-reader', 'api-client'],
      };

      // Mock search API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [npmServerDetail],
          metadata: { count: 1, next_cursor: null },
        }),
      });

      // Mock getServer API response (uses search internally)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [npmServerDetail],
          metadata: { count: 1, next_cursor: null },
        }),
      });

      const context = RegistryContext.getInstance(mockProxyConfig);

      // Step 1: Search for servers
      const searchResult = await context.searchServers('example');
      expect(searchResult.found).toBe(true);
      expect(searchResult.servers).toHaveLength(1);
      expect(searchResult.servers![0].name).toBe('NPM Example Server');
      expect(searchResult.servers![0].registryId).toBe('npm-example-registry-id');
      expect(searchResult.servers![0].isRemote).toBe(false);

      // Step 2: Get server details using server name (since getServer searches by name)
      const serverDetails = await context.getServerDetails('NPM Example Server');
      expect(serverDetails).toBeTruthy();
      expect(serverDetails!.name).toBe('NPM Example Server');
      expect(serverDetails!.packages).toHaveLength(1);

      // Step 3: Generate configuration
      const config = await context.generateServerConfig(serverDetails!);
      expect(config.name).toBe('NPM Example Server');
      expect(config.command).toBe('node');
      expect(config.args).toEqual(['@mcp/example-server', '--config', 'production.json']);
      expect(config.env).toEqual({ NODE_ENV: 'production' });

      // Step 4: Generate install instructions
      const installInfo = await context.generateInstallInfo(serverDetails!);
      expect(installInfo.name).toBe('NPM Example Server');
      expect(installInfo.configSnippet.command).toBe('node');
      expect(installInfo.installInstructions).toContain('npm');
      expect(installInfo.installInstructions).toContain('@mcp/example-server');
      expect(installInfo.tools).toEqual(['file-reader', 'api-client']);
    });

    it('should complete full flow for remote SSE server with headers', async () => {
      const headers: KeyValueInput[] = [
        {
          name: 'Authorization',
          value: 'Bearer ${API_TOKEN}',
          is_required: true,
          is_secret: true,
        },
        {
          name: 'Content-Type',
          value: 'text/event-stream',
          is_required: false,
        },
        { name: 'Accept', value: 'text/event-stream', is_required: false },
      ];

      const remoteServerDetail: ServerDetail = {
        id: 'remote-sse-server',
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            id: 'remote-sse-registry-id',
            published_at: '2025-01-01T00:00:00Z',
            updated_at: '2025-01-01T00:00:00Z',
          },
        },
        name: 'Remote SSE Server',
        description: 'Server accessed via Server-Sent Events',
        remotes: [
          {
            type: 'sse',
            url: 'https://api.example.com/mcp/events',
            headers,
          },
        ],
        tools: ['remote-api', 'event-stream'],
      };

      // Mock API responses
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [remoteServerDetail],
          metadata: { count: 1, next_cursor: null },
        }),
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [remoteServerDetail],
          metadata: { count: 1, next_cursor: null },
        }),
      });

      const context = RegistryContext.getInstance(mockProxyConfig);

      // Full flow execution
      const _searchResult = await context.searchServers('remote sse');
      const serverDetails = await context.getServerDetails('Remote SSE Server');
      const config = await context.generateServerConfig(serverDetails!);
      const installInfo = await context.generateInstallInfo(serverDetails!);

      // Verify remote configuration
      expect(config.transport).toBe('sse');
      expect(config.url).toBe('https://api.example.com/mcp/events');

      // Headers are converted from KeyValueInput[] to Record<string, string> by RegistryContext
      expect(typeof config.headers).toBe('object');
      expect(config.headers).toEqual({
        Authorization: 'Bearer ${API_TOKEN}',
        'Content-Type': 'text/event-stream',
        Accept: 'text/event-stream',
      });

      // Verify install instructions mention authentication
      expect(installInfo.installInstructions).toContain('authentication');
      expect(installInfo.installInstructions).toContain('API_TOKEN');
      expect(installInfo.installInstructions).toContain('Bearer');
    });

    it('should complete full flow for server lookup by UUID', async () => {
      const serverUuid = 'a8a5c761-c1dc-4d1d-9100-b57df4c9ec0d';
      const mockServer: ServerDetail = {
        id: serverUuid,
        name: 'mcp-funnel-server',
        description: 'MCP proxy server',
        packages: [
          {
            registry_type: 'npm' as const,
            identifier: '@chris-schra/mcp-funnel',
            runtime_hint: 'npx',
            environment_variables: [],
          },
        ],
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            id: serverUuid,
            published_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z',
          },
        },
      };

      // Mock direct GET endpoint for UUID
      mockFetch.mockImplementation(async (url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();

        if (urlStr.includes(`/v0/servers/${serverUuid}`)) {
          return {
            ok: true,
            status: 200,
            json: async () => mockServer,
          } as Response;
        }

        throw new Error(`Unexpected fetch: ${urlStr}`);
      });

      const context = RegistryContext.getInstance(mockProxyConfig);

      // Get server details by UUID
      const serverDetails = await context.getServerDetails(serverUuid);
      expect(serverDetails).toEqual(mockServer);

      // Generate config
      const config = await context.generateServerConfig(mockServer);
      expect(config.command).toBe('npx');
      expect(config.args).toEqual(['@chris-schra/mcp-funnel']);

      // Generate install info
      const installInfo = await context.generateInstallInfo(mockServer);
      expect(installInfo.name).toBe('mcp-funnel-server');
      expect(installInfo.configSnippet.command).toBe('npx');
    });

    it('should handle UUID lookup failure gracefully', async () => {
      const invalidUuid = '550e8400-e29b-41d4-a716-446655440000';

      // Mock 404 response for invalid UUID
      mockFetch.mockImplementation(async (url) => {
        const urlStr = typeof url === 'string' ? url : url.toString();

        if (urlStr.includes(`/v0/servers/${invalidUuid}`)) {
          return {
            ok: false,
            status: 404,
            statusText: 'Not Found',
          } as Response;
        }

        throw new Error(`Unexpected fetch: ${urlStr}`);
      });

      const context = RegistryContext.getInstance(mockProxyConfig);

      // Get server details should return null for not found
      const serverDetails = await context.getServerDetails(invalidUuid);
      expect(serverDetails).toBeNull();
    });
  });
});
