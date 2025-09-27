import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { RegistryContext } from './registry-context.js';

// Test fixtures and helpers
import {
  mockConfig,
  emptyConfig,
  configWithRegistries,
  malformedConfig,
  invalidConfig,
  tempServerConfigs,
  mockRegistryServers,
  mockResponses,
  errorMessages,
  registryTestCases,
  errorTestCases,
} from './test-fixtures/registry-context.fixtures.js';

import {
  setupMocks,
  beforeEachSetup,
  afterEachCleanup,
  createRegistryContext,
  getRegistryContextInstance,
  setupSuccessResponse,
  setupErrorResponse,
  setup404Response,
  assertSearchResult,
  assertServerDetails,
  assertTemporaryServer,
  assertConfigGeneration,
  assertInstallInfo,
  assertFetchCall,
  assertNoFetchCall,
  runConcurrentTests,
} from './test-helpers/registry-context.helpers.js';

// Setup mocks
const mockFetch = setupMocks();

describe('RegistryContext', () => {
  beforeEach(() => beforeEachSetup(mockFetch));
  afterEach(afterEachCleanup);

  describe('Singleton Pattern', () => {
    it('should return same instance on subsequent calls', () => {
      const instance1 = createRegistryContext(mockConfig);
      const instance2 = getRegistryContextInstance();
      expect(instance1).toBe(instance2);
    });

    it('should require config on first access', () => {
      expect(() => getRegistryContextInstance()).toThrow(
        'RegistryContext must be initialized with config on first access',
      );
    });

    it('should allow reset and require config again', () => {
      const instance1 = createRegistryContext(mockConfig);
      RegistryContext.reset();

      expect(() => getRegistryContextInstance()).toThrow(
        'RegistryContext must be initialized with config on first access',
      );

      const instance2 = createRegistryContext(mockConfig);
      expect(instance1).not.toBe(instance2);
    });

    it('should not require config after first initialization', () => {
      createRegistryContext(mockConfig);
      expect(() => getRegistryContextInstance()).not.toThrow();
    });
  });

  describe('Registry Client Initialization', () => {
    const initializationTests = [
      {
        name: 'single server config',
        config: mockConfig,
        expectedRegistries: true,
      },
      {
        name: 'empty server list',
        config: emptyConfig,
        expectedRegistries: true, // Should have default registry
      },
      {
        name: 'multiple registry URLs',
        config: configWithRegistries,
        expectedRegistries: true,
      },
    ];

    initializationTests.forEach(({ name, config, expectedRegistries }) => {
      it(`should handle ${name}`, () => {
        const context = createRegistryContext(config);
        expect(context).toBeDefined();
        expect(context.hasRegistries()).toBe(expectedRegistries);
      });
    });
  });

  describe('searchServers() method', () => {
    it('should aggregate results from multiple registries', async () => {
      setupSuccessResponse(mockFetch, mockResponses.singleServer);
      const context = createRegistryContext(mockConfig);
      const result = await context.searchServers('filesystem');

      assertSearchResult(result, {
        found: true,
        serverCount: 1,
        messageIncludes: 'Found 1 server',
        serverName: 'filesystem-server',
      });
    });

    it('should handle no results found', async () => {
      setupSuccessResponse(mockFetch, mockResponses.empty);
      const context = createRegistryContext(mockConfig);
      const result = await context.searchServers('nonexistent');

      assertSearchResult(result, {
        found: false,
        serverCount: 0,
        messageIncludes: 'No servers found',
      });
    });

    // Parameterized tests for error handling
    errorTestCases.forEach(({ name, error, expectedMessage }) => {
      it(`should handle ${name} gracefully`, async () => {
        setupErrorResponse(mockFetch, error);
        const context = createRegistryContext(mockConfig);
        const result = await context.searchServers('error');

        assertSearchResult(result, {
          found: false,
          serverCount: 0,
          messageIncludes: expectedMessage,
        });
      });
    });

    it('should accept optional registry parameter', async () => {
      setupSuccessResponse(mockFetch, mockResponses.empty);
      const context = createRegistryContext(mockConfig);
      const result = await context.searchServers('filesystem', 'example');

      expect(result).toBeDefined();
      expect(typeof result.found).toBe('boolean');
      expect(Array.isArray(result.servers)).toBe(true);
      expect(typeof result.message).toBe('string');
    });

    // Parameterized tests for registry filtering
    registryTestCases.forEach(
      ({ name, registryId, shouldCallFetch, expectedUrl, expectedMessage }) => {
        it(`should handle ${name}`, async () => {
          if (shouldCallFetch) {
            setupSuccessResponse(
              mockFetch,
              registryId === 'official'
                ? mockResponses.officialServer
                : mockResponses.empty,
            );
          }

          const context = createRegistryContext(mockConfig);
          const result = await context.searchServers('filesystem', registryId);

          if (shouldCallFetch) {
            assertFetchCall(mockFetch, expectedUrl!);
            if (registryId === 'official') {
              assertSearchResult(result, {
                found: true,
                serverCount: 1,
                serverName: 'official-server',
              });
            }
          } else {
            assertNoFetchCall(mockFetch);
            assertSearchResult(result, {
              found: false,
              serverCount: 0,
              messageIncludes: expectedMessage!,
            });
          }
        });
      },
    );
  });

  describe('getServerDetails() method', () => {
    it('should find server and return details', async () => {
      setupSuccessResponse(mockFetch, mockResponses.detailedServer);
      const context = createRegistryContext(mockConfig);
      const details = await context.getServerDetails('fs-001');

      assertServerDetails(details, {
        shouldExist: true,
        name: 'fs-001',
        toolIncludes: 'read_file',
      });
    });

    it('should return null if server not found', async () => {
      setup404Response(mockFetch);
      const context = createRegistryContext(mockConfig);
      const details = await context.getServerDetails('nonexistent-server');

      assertServerDetails(details, { shouldExist: false });
    });

    it('should continue to next registry on error', async () => {
      setupErrorResponse(mockFetch, new Error('Server details unavailable'));
      const context = createRegistryContext(mockConfig);
      const details = await context.getServerDetails('error-server');

      assertServerDetails(details, { shouldExist: false });
    });
  });

  describe('Extension Points (Phase 2)', () => {
    describe('enableTemporary()', () => {
      const tempTests = [
        { name: 'basic config', config: tempServerConfigs.basic },
        { name: 'config with environment', config: tempServerConfigs.withEnv },
      ];

      tempTests.forEach(({ name, config }) => {
        it(`should handle ${name}`, async () => {
          const context = createRegistryContext(mockConfig);
          const serverId = await context.enableTemporary(config);
          assertTemporaryServer(serverId);
        });
      });
    });

    describe('persistTemporary()', () => {
      it('should persist temporary server config', async () => {
        const context = createRegistryContext(mockConfig);
        const config = tempServerConfigs.docker;

        await context.enableTemporary(config);
        await expect(
          context.persistTemporary(config.name),
        ).resolves.not.toThrow();
      });

      it('should throw for non-existent server name', async () => {
        const context = createRegistryContext(mockConfig);
        await expect(
          context.persistTemporary('nonexistent-server'),
        ).rejects.toThrow(
          errorMessages.tempServerNotFound('nonexistent-server'),
        );
      });

      it('should handle multiple persistence calls', async () => {
        const context = createRegistryContext(mockConfig);
        const config = tempServerConfigs.simple;

        await context.enableTemporary(config);
        await expect(
          context.persistTemporary(config.name),
        ).resolves.not.toThrow();
        await expect(
          context.persistTemporary(config.name),
        ).resolves.not.toThrow();
      });
    });
  });

  describe('Additional Functionality', () => {
    const functionalityTests = [
      {
        name: 'server config generation',
        testFn: async (context: RegistryContext) => {
          const config = await context.generateServerConfig(
            mockRegistryServers.basic,
          );
          assertConfigGeneration(config, 'test-server');
        },
      },
      {
        name: 'install info generation',
        testFn: async (context: RegistryContext) => {
          const installInfo = await context.generateInstallInfo(
            mockRegistryServers.basic,
          );
          assertInstallInfo(installInfo, 'test-server');
        },
      },
      {
        name: 'registry availability check',
        testFn: async (context: RegistryContext) => {
          expect(context.hasRegistries()).toBe(true);
        },
      },
    ];

    functionalityTests.forEach(({ name, testFn }) => {
      it(`should provide ${name}`, async () => {
        const context = createRegistryContext(mockConfig);
        await testFn(context);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle concurrent requests safely', async () => {
      setupSuccessResponse(mockFetch, mockResponses.empty);
      const context = createRegistryContext(mockConfig);

      const promises = [
        context.searchServers('filesystem'),
        context.searchServers('filesystem'),
        context.getServerDetails('fs-001'),
        context.getServerDetails('fs-001'),
      ];

      await runConcurrentTests(promises);
    });
  });

  describe('Configuration Edge Cases', () => {
    const configTests = [
      { name: 'malformed config', config: malformedConfig },
      { name: 'empty config', config: emptyConfig },
      { name: 'invalid config', config: invalidConfig },
    ];

    configTests.forEach(({ name, config }) => {
      it(`should handle ${name} gracefully`, () => {
        expect(() => createRegistryContext(config)).not.toThrow();
      });
    });
  });
});
