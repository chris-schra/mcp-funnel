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
import { testServers } from './__test__/test-fixtures.js';
import {
  createMockProxyConfig,
  mockSingleServerFlow,
  mockUuidLookup,
  mockErrorScenario,
  assertSearchResult,
  assertErrorResult,
  assertConfig,
} from './__test__/test-utils.js';
import {
  packageTypeConfigCases,
  remoteConfigCases,
  environmentVariableCases,
  backwardCompatibilityCases,
  argumentValidationCases,
  headerValidationCases,
  envExclusionCases,
} from './__test__/config-test-cases.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Registry Integration Tests', () => {
  let mockProxyConfig: ReturnType<typeof createMockProxyConfig>;

  beforeEach(() => {
    vi.clearAllMocks();
    RegistryContext.reset();
    mockProxyConfig = createMockProxyConfig();
  });

  afterEach(() => {
    RegistryContext.reset();
  });

  describe('Full Flow: Search → Get Details → Generate Config', () => {
    it('should complete full flow for NPM package server', async () => {
      mockSingleServerFlow(mockFetch, testServers.npm);
      const context = RegistryContext.getInstance(mockProxyConfig);

      // Step 1: Search for servers
      const searchResult = await context.searchServers('example');
      assertSearchResult(searchResult, { found: true, count: 1 });
      expect(searchResult.servers![0].name).toBe('NPM Example Server');
      expect(searchResult.servers![0].registryId).toBe(
        'npm-example-registry-id',
      );
      expect(searchResult.servers![0].isRemote).toBe(false);

      // Step 2: Get server details
      const serverDetails =
        await context.getServerDetails('NPM Example Server');
      expect(serverDetails).toBeTruthy();
      expect(serverDetails!.name).toBe('NPM Example Server');
      expect(serverDetails!.packages).toHaveLength(1);

      // Step 3: Generate configuration
      const config = await context.generateServerConfig(serverDetails!);
      assertConfig(config, {
        command: 'npx',
        argsPattern: [
          '-y',
          '@mcp/example-server',
          '--config',
          'production.json',
        ],
        env: { NODE_ENV: 'production' },
      });

      // Step 4: Generate install instructions
      const installInfo = await context.generateInstallInfo(serverDetails!);
      expect(installInfo.name).toBe('NPM Example Server');
      expect(installInfo.configSnippet.command).toBe('npx');
      expect(installInfo.installInstructions).toContain('npm');
      expect(installInfo.installInstructions).toContain('@mcp/example-server');
      expect(installInfo.tools).toEqual(['file-reader', 'api-client']);
    });

    it('should complete full flow for remote SSE server with headers', async () => {
      mockSingleServerFlow(mockFetch, testServers.remoteSSE);
      const context = RegistryContext.getInstance(mockProxyConfig);

      // Full flow execution
      const _searchResult = await context.searchServers('remote sse');
      const serverDetails = await context.getServerDetails('Remote SSE Server');
      const config = await context.generateServerConfig(serverDetails!);
      const installInfo = await context.generateInstallInfo(serverDetails!);

      // Verify remote configuration
      assertConfig(config, {
        transport: 'sse',
        url: 'https://api.example.com/mcp/events',
        headerCheck: 'object',
      });

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
      const serverUuid = testServers.uuid.id;
      mockUuidLookup(mockFetch, serverUuid, testServers.uuid);
      const context = RegistryContext.getInstance(mockProxyConfig);

      // Get server details by UUID
      const serverDetails = await context.getServerDetails(serverUuid);
      expect(serverDetails).toEqual(testServers.uuid);

      // Generate config
      const config = await context.generateServerConfig(testServers.uuid);
      assertConfig(config, {
        command: 'npx',
        argsPattern: ['@chris-schra/mcp-funnel'],
      });

      // Generate install info
      const installInfo = await context.generateInstallInfo(testServers.uuid);
      expect(installInfo.name).toBe('mcp-funnel-server');
      expect(installInfo.configSnippet.command).toBe('npx');
    });

    it('should handle UUID lookup failure gracefully', async () => {
      const invalidUuid = '550e8400-e29b-41d4-a716-446655440000';
      mockUuidLookup(mockFetch, invalidUuid, null);
      const context = RegistryContext.getInstance(mockProxyConfig);

      // Get server details should return null for not found
      const serverDetails = await context.getServerDetails(invalidUuid);
      expect(serverDetails).toBeNull();
    });
  });

  describe('Multiple Package Types Configuration Validation', () => {
    it.each(packageTypeConfigCases)('$name', ({ server, expected }) => {
      const config = generateConfigSnippet(server);
      assertConfig(config, expected);
    });

    it.each(remoteConfigCases)('$name', ({ server, expected }) => {
      const config = generateConfigSnippet(server);
      assertConfig(config, expected);
    });

    it.each(environmentVariableCases)('$name', ({ server, expected }) => {
      const config = generateConfigSnippet(server);
      if (expected.env) {
        assertConfig(config, { env: expected.env });
      }
      if (expected.command) {
        assertConfig(config, {
          command: expected.command,
          argsPattern: expected.args,
        });
      }
    });
  });

  describe('Error Scenarios', () => {
    const errorScenarios = [
      {
        name: 'server not found',
        scenario: 'not-found' as const,
        term: 'non-existent-server',
      },
      { name: 'network errors', scenario: 'network' as const, term: 'test' },
      {
        name: 'HTTP 500 errors',
        scenario: 'server-error' as const,
        term: 'test',
      },
      { name: 'HTTP 404 errors', scenario: 'not-found' as const, term: 'test' },
      {
        name: 'malformed JSON responses',
        scenario: 'malformed' as const,
        term: 'test',
      },
    ];

    it.each(errorScenarios)(
      'should handle $name gracefully',
      async ({ scenario, term }) => {
        mockErrorScenario(mockFetch, scenario);
        const context = RegistryContext.getInstance(mockProxyConfig);

        if (term === 'non-existent-server') {
          const serverDetails = await context.getServerDetails(term);
          expect(serverDetails).toBeNull();
        } else {
          const searchResult = await context.searchServers(term);
          assertErrorResult(searchResult);
        }
      },
    );

    it('should handle invalid registry ID gracefully', async () => {
      mockErrorScenario(mockFetch, 'not-found');
      const context = RegistryContext.getInstance(mockProxyConfig);
      const searchResult = await context.searchServers(
        'invalid-search-term-that-returns-nothing',
      );

      expect(searchResult.found).toBe(false);
      expect(searchResult.servers).toEqual([]);
      expect(searchResult.message).toContain('Registry errors');
    });
  });

  describe('Config Generation Validation', () => {
    it.each(argumentValidationCases)('$name', ({ server, validate }) => {
      const config = generateConfigSnippet(server);
      validate(config);
    });

    it.each(headerValidationCases)('$name', ({ server, validate }) => {
      const config = generateConfigSnippet(server);
      validate(config);
    });

    it.each(envExclusionCases)('$name', ({ server, validate }) => {
      const config = generateConfigSnippet(server);
      validate(config);
    });
  });

  describe('Backward Compatibility', () => {
    it('should handle servers without _meta field', async () => {
      mockSingleServerFlow(mockFetch, testServers.legacy);
      const context = RegistryContext.getInstance(mockProxyConfig);

      expect(async () => {
        const searchResult = await context.searchServers('legacy');
        expect(searchResult.found).toBe(true);
        expect(searchResult.servers![0].registryId).toBe('legacy-server-id'); // Falls back to id
      }).not.toThrow();
    });

    it.each(backwardCompatibilityCases)('$name', ({ server, expected }) => {
      const config = generateConfigSnippet(server);

      if (expected.command || expected.transport) {
        assertConfig(config, expected);
      } else {
        // For old format servers, should have _raw_metadata
        expect(config._raw_metadata).toBeTruthy();
        expect(config.name).toBe(server.name);
      }
    });
  });

  describe('Integration with MCPRegistryClient', () => {
    it('should properly integrate client search with context aggregation', async () => {
      // Define mock servers inline to avoid fixture conflicts
      const mockServers = [
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

      // Clear and set mock
      mockFetch.mockClear();
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
