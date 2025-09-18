/**
 * Comprehensive integration tests for the registry module.
 *
 * Tests the full flow of registry operations against mock data that simulates
 * real API responses. Validates the entire flow from search to configuration
 * generation across all supported package types and error scenarios.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { RegistryContext } from './registry-context.js';
import { MCPRegistryClient } from './registry-client.js';
import { generateConfigSnippet } from './config-generator.js';
import type {
  RegistryServer,
  Package,
  Remote,
  KeyValueInput,
  EnvironmentVariable,
  ServerDetail,
} from './types/registry.types.js';
import type { ProxyConfig } from '../config.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Registry Integration Tests', () => {
  let mockProxyConfig: ProxyConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    RegistryContext.reset();

    mockProxyConfig = {
      servers: [],
      registries: ['https://registry.modelcontextprotocol.io'],
    } as ProxyConfig;
  });

  afterEach(() => {
    RegistryContext.reset();
  });

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
      expect(searchResult.servers![0].registryId).toBe(
        'npm-example-registry-id',
      );
      expect(searchResult.servers![0].isRemote).toBe(false);

      // Step 2: Get server details using server name (since getServer searches by name)
      const serverDetails =
        await context.getServerDetails('NPM Example Server');
      expect(serverDetails).toBeTruthy();
      expect(serverDetails!.name).toBe('NPM Example Server');
      expect(serverDetails!.packages).toHaveLength(1);

      // Step 3: Generate configuration
      const config = await context.generateServerConfig(serverDetails!);
      expect(config.name).toBe('NPM Example Server');
      expect(config.command).toBe('npx');
      expect(config.args).toEqual([
        '-y',
        '@mcp/example-server',
        '--config',
        'production.json',
      ]);
      expect(config.env).toEqual({ NODE_ENV: 'production' });

      // Step 4: Generate install instructions
      const installInfo = await context.generateInstallInfo(serverDetails!);
      expect(installInfo.name).toBe('NPM Example Server');
      expect(installInfo.configSnippet.command).toBe('npx');
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
      expect(config.args).toEqual(['-y', '@chris-schra/mcp-funnel']);

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

  describe('Multiple Package Types Configuration Validation', () => {
    it('should generate correct NPM config with npx', async () => {
      const npmPackage: Package = {
        identifier: '@scope/npm-server',
        registry_type: 'npm',
        package_arguments: ['--production', '--port', '3000'],
        environment_variables: [{ name: 'NODE_ENV', value: 'production' }],
      };

      const server: RegistryServer = {
        id: 'npm-server',
        name: 'NPM Server',
        description: 'NPM package server',
        packages: [npmPackage],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('npx');
      expect(config.args).toEqual([
        '-y',
        '@scope/npm-server',
        '--production',
        '--port',
        '3000',
      ]);
      expect(config.env).toEqual({ NODE_ENV: 'production' });
    });

    it('should generate correct PyPI config with uvx', async () => {
      const pypiPackage: Package = {
        identifier: 'mcp-python-server',
        registry_type: 'pypi',
        package_arguments: ['--verbose', '--host', '0.0.0.0'],
        environment_variables: [
          { name: 'PYTHONPATH', value: '/opt/mcp' },
          { name: 'LOG_LEVEL', value: 'DEBUG' },
        ],
      };

      const server: RegistryServer = {
        id: 'pypi-server',
        name: 'PyPI Server',
        description: 'Python package server',
        packages: [pypiPackage],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('uvx');
      expect(config.args).toEqual([
        'mcp-python-server',
        '--verbose',
        '--host',
        '0.0.0.0',
      ]);
      expect(config.env).toEqual({
        PYTHONPATH: '/opt/mcp',
        LOG_LEVEL: 'DEBUG',
      });
    });

    it('should generate correct OCI config with docker', async () => {
      const ociPackage: Package = {
        identifier: 'ghcr.io/example/mcp-server:v1.0.0',
        registry_type: 'oci',
        package_arguments: ['--config', '/app/config.json'],
        environment_variables: [
          { name: 'CONTAINER_PORT', value: '8080' },
          { name: 'ENV', value: 'production' },
        ],
      };

      const server: RegistryServer = {
        id: 'oci-server',
        name: 'OCI Container Server',
        description: 'Container-based server',
        packages: [ociPackage],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('docker');
      expect(config.args).toEqual([
        'run',
        '-i',
        '--rm',
        'ghcr.io/example/mcp-server:v1.0.0',
        '--config',
        '/app/config.json',
      ]);
      expect(config.env).toEqual({
        CONTAINER_PORT: '8080',
        ENV: 'production',
      });
    });

    it('should generate correct remote config with proper headers', async () => {
      const headers: KeyValueInput[] = [
        {
          name: 'Authorization',
          value: 'Bearer token123',
          is_required: true,
          is_secret: true,
        },
        { name: 'X-API-Version', value: 'v1', is_required: false },
        { name: 'User-Agent', value: 'MCP-Client/1.0', is_required: false },
      ];

      const remote: Remote = {
        type: 'websocket',
        url: 'wss://api.example.com/mcp/ws',
        headers,
      };

      const server: RegistryServer = {
        id: 'remote-ws-server',
        name: 'Remote WebSocket Server',
        description: 'WebSocket-based remote server',
        remotes: [remote],
      };

      const config = generateConfigSnippet(server);

      expect(config.transport).toBe('websocket');
      expect(config.url).toBe('wss://api.example.com/mcp/ws');
      expect(config.headers).toEqual(headers);
    });

    it('should handle GitHub package type correctly', async () => {
      const githubPackage: Package = {
        identifier: 'owner/repo',
        registry_type: 'github',
        package_arguments: ['start', '--production'],
        environment_variables: [
          { name: 'GITHUB_TOKEN', is_required: true },
          { name: 'NODE_ENV', value: 'production' },
        ],
      };

      const server: RegistryServer = {
        id: 'github-server',
        name: 'GitHub Server',
        description: 'GitHub repository server',
        packages: [githubPackage],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('npx');
      expect(config.args).toEqual([
        '-y',
        'github:owner/repo',
        'start',
        '--production',
      ]);
      expect(config.env).toEqual({ NODE_ENV: 'production' });
    });
  });

  describe('Error Scenarios', () => {
    it('should handle server not found gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [],
          metadata: { count: 0, next_cursor: null },
        }),
      });

      const context = RegistryContext.getInstance(mockProxyConfig);
      const serverDetails = await context.getServerDetails(
        'non-existent-server',
      );

      expect(serverDetails).toBeNull();
    });

    it('should handle invalid registry ID gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [],
          metadata: { count: 0, next_cursor: null },
        }),
      });

      const context = RegistryContext.getInstance(mockProxyConfig);
      const searchResult = await context.searchServers(
        'invalid-search-term-that-returns-nothing',
      );

      expect(searchResult.found).toBe(false);
      expect(searchResult.servers).toEqual([]);
      expect(searchResult.message).toBe('No servers found');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const context = RegistryContext.getInstance(mockProxyConfig);

      const searchResult = await context.searchServers('test');
      expect(searchResult.found).toBe(false);
      expect(searchResult.servers).toEqual([]);
      expect(searchResult.message).toContain('Registry errors');
    });

    it('should handle HTTP 500 errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({}),
      });

      const context = RegistryContext.getInstance(mockProxyConfig);

      const searchResult = await context.searchServers('test');
      expect(searchResult.found).toBe(false);
      expect(searchResult.servers).toEqual([]);
      expect(searchResult.message).toContain('Registry errors');
    });

    it('should handle HTTP 404 errors gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({}),
      });

      const context = RegistryContext.getInstance(mockProxyConfig);

      const searchResult = await context.searchServers('test');
      expect(searchResult.found).toBe(false);
      expect(searchResult.servers).toEqual([]);
      expect(searchResult.message).toContain('Registry errors');
    });

    it('should handle malformed JSON responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      });

      const context = RegistryContext.getInstance(mockProxyConfig);

      const searchResult = await context.searchServers('test');
      expect(searchResult.found).toBe(false);
      expect(searchResult.servers).toEqual([]);
      expect(searchResult.message).toContain('Registry errors');
    });
  });

  describe('Config Generation Validation', () => {
    it('should validate NPM configs use npx with correct arguments', () => {
      const server: RegistryServer = {
        id: 'npm-validation',
        name: 'NPM Validation Server',
        description: 'Server for NPM config validation',
        packages: [
          {
            identifier: '@validation/server',
            registry_type: 'npm',
            package_arguments: ['--flag1', '--flag2'],
          },
        ],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('npx');
      expect(config.args![0]).toBe('-y');
      expect(config.args![1]).toBe('@validation/server');
      expect(config.args).toContain('--flag1');
      expect(config.args).toContain('--flag2');
    });

    it('should validate PyPI configs use uvx with correct arguments', () => {
      const server: RegistryServer = {
        id: 'pypi-validation',
        name: 'PyPI Validation Server',
        description: 'Server for PyPI config validation',
        packages: [
          {
            identifier: 'validation-server',
            registry_type: 'pypi',
            package_arguments: ['--debug', '--port', '5000'],
          },
        ],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('uvx');
      expect(config.args![0]).toBe('validation-server');
      expect(config.args).toContain('--debug');
      expect(config.args).toContain('--port');
      expect(config.args).toContain('5000');
    });

    it('should validate OCI configs use docker with proper flags', () => {
      const server: RegistryServer = {
        id: 'oci-validation',
        name: 'OCI Validation Server',
        description: 'Server for OCI config validation',
        packages: [
          {
            identifier: 'registry.example.com/validation:latest',
            registry_type: 'oci',
            package_arguments: ['--mount', '/data'],
          },
        ],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('docker');
      expect(config.args).toEqual([
        'run',
        '-i',
        '--rm',
        'registry.example.com/validation:latest',
        '--mount',
        '/data',
      ]);
    });

    it('should validate remote configs have proper transport and headers', () => {
      const headers: KeyValueInput[] = [
        {
          name: 'X-Auth-Token',
          value: 'secret123',
          is_required: true,
          is_secret: true,
        },
        { name: 'Content-Type', value: 'application/json', is_required: false },
      ];

      const server: RegistryServer = {
        id: 'remote-validation',
        name: 'Remote Validation Server',
        description: 'Server for remote config validation',
        remotes: [
          {
            type: 'sse',
            url: 'https://validation.example.com/events',
            headers,
          },
        ],
      };

      const config = generateConfigSnippet(server);

      expect(config.transport).toBe('sse');
      expect(config.url).toBe('https://validation.example.com/events');
      expect(config.headers).toEqual(headers);

      // Verify header structure
      expect(Array.isArray(config.headers)).toBe(true);
      const authHeader = (config.headers as KeyValueInput[]).find(
        (h) => h.name === 'X-Auth-Token',
      );
      expect(authHeader).toBeTruthy();
      expect(authHeader!.is_required).toBe(true);
      expect(authHeader!.is_secret).toBe(true);
    });

    it('should handle environment variables correctly with is_required field', () => {
      const envVars: EnvironmentVariable[] = [
        { name: 'REQUIRED_VAR', is_required: true },
        { name: 'OPTIONAL_VAR', value: 'default_value', is_required: false },
        { name: 'ANOTHER_REQUIRED', is_required: true },
        { name: 'WITH_VALUE', value: 'some_value' },
      ];

      const server: RegistryServer = {
        id: 'env-validation',
        name: 'Environment Validation Server',
        description: 'Server for environment variable validation',
        packages: [
          {
            identifier: 'env-server',
            registry_type: 'npm',
            environment_variables: envVars,
          },
        ],
      };

      const config = generateConfigSnippet(server);

      // Should only include variables with values (not required-only vars)
      expect(config.env).toEqual({
        OPTIONAL_VAR: 'default_value',
        WITH_VALUE: 'some_value',
      });

      // Required-only variables without values should not be included
      expect(config.env).not.toHaveProperty('REQUIRED_VAR');
      expect(config.env).not.toHaveProperty('ANOTHER_REQUIRED');
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle servers without _meta field', () => {
      const serverWithoutMeta: ServerDetail = {
        id: 'legacy-server-id',
        name: 'Legacy Server',
        description: 'Server without _meta field for backward compatibility',
        packages: [
          {
            identifier: 'legacy-package',
            registry_type: 'npm',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [serverWithoutMeta],
          metadata: { count: 1, next_cursor: null },
        }),
      });

      const context = RegistryContext.getInstance(mockProxyConfig);

      expect(async () => {
        const searchResult = await context.searchServers('legacy');
        expect(searchResult.found).toBe(true);
        expect(searchResult.servers![0].registryId).toBe('legacy-server-id'); // Falls back to id
      }).not.toThrow();
    });

    it('should handle packages without environment_variables field', () => {
      const packageWithoutEnv: Package = {
        identifier: 'simple-package',
        registry_type: 'npm',
        package_arguments: ['--simple'],
      };

      const server: RegistryServer = {
        id: 'simple-server',
        name: 'Simple Server',
        description: 'Server with package without env vars',
        packages: [packageWithoutEnv],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('npx');
      expect(config.args).toEqual(['-y', 'simple-package', '--simple']);
      expect(config.env).toBeUndefined();
    });

    it('should handle remotes without headers field', () => {
      const remoteWithoutHeaders: Remote = {
        type: 'stdio',
        url: 'http://localhost:3000/mcp',
      };

      const server: RegistryServer = {
        id: 'simple-remote',
        name: 'Simple Remote Server',
        description: 'Remote server without headers',
        remotes: [remoteWithoutHeaders],
      };

      const config = generateConfigSnippet(server);

      expect(config.transport).toBe('stdio');
      expect(config.url).toBe('http://localhost:3000/mcp');
      expect(config.headers).toBeUndefined();
    });

    it('should handle old format servers with missing registry_type', () => {
      const packageWithoutRegistryType = {
        identifier: 'unknown-package',
        // Missing registry_type field
        package_arguments: ['--legacy'],
      } as Package;

      const server: RegistryServer = {
        id: 'old-format-server',
        name: 'Old Format Server',
        description: 'Server with old package format',
        packages: [packageWithoutRegistryType],
      };

      const config = generateConfigSnippet(server);

      // Should fall back to raw metadata for unknown types
      expect(config._raw_metadata).toBeTruthy();
      expect(config.name).toBe('Old Format Server');
    });
  });

  describe('Integration with MCPRegistryClient', () => {
    it('should properly integrate client search with context aggregation', async () => {
      const mockServers: ServerDetail[] = [
        {
          id: 'client-server-1',
          _meta: {
            'io.modelcontextprotocol.registry/official': {
              id: 'client-registry-1',
              published_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          },
          name: 'Client Server 1',
          description: 'First server from client',
          packages: [{ identifier: 'client-pkg-1', registry_type: 'npm' }],
        },
        {
          id: 'client-server-2',
          _meta: {
            'io.modelcontextprotocol.registry/official': {
              id: 'client-registry-2',
              published_at: '2025-01-01T00:00:00Z',
              updated_at: '2025-01-01T00:00:00Z',
            },
          },
          name: 'Client Server 2',
          description: 'Second server from client',
          remotes: [{ type: 'sse', url: 'https://example.com/sse' }],
        },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: mockServers,
          metadata: { count: 2, next_cursor: null },
        }),
      });

      const client = new MCPRegistryClient(
        'https://registry.modelcontextprotocol.io',
      );
      const servers = await client.searchServers('client test');

      expect(servers).toHaveLength(2);
      expect(servers[0].name).toBe('Client Server 1');
      expect(servers[1].name).toBe('Client Server 2');

      // Verify the client properly handles the real API response format
      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.modelcontextprotocol.io/v0/servers?search=client%20test',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Accept: 'application/json',
          }),
        }),
      );
    });
  });
});
