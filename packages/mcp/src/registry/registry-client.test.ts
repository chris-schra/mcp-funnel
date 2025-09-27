/**
 * Comprehensive tests for MCPRegistryClient.
 *
 * Tests the real MCP Registry API integration with proper endpoint structure.
 * Uses the actual implementation with mocked fetch calls.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ServerDetail } from './types/registry.types.js';
import { MCPRegistryClient } from './registry-client.js';

// Test utilities and fixtures
import {
  MOCK_SERVERS,
  TEST_CONSTANTS,
  TEST_SCENARIOS,
  CACHE_KEYS,
} from './__tests__/fixtures.js';
import {
  HttpMockHelper,
  AssertionHelper,
  CacheTestHelper,
  createHttpMockHelper,
  runParameterizedTests,
} from './__tests__/helpers.js';
import { MockCache, NoOpCache, CacheFactory } from './__tests__/mock-cache.js';

describe('MCPRegistryClient', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let httpMock: HttpMockHelper;
  let mockCache: MockCache;
  let noOpCache: NoOpCache;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
    httpMock = createHttpMockHelper(mockFetch);
    mockCache = CacheFactory.createMockCache();
    noOpCache = CacheFactory.createNoOpCache();
  });

  describe('constructor', () => {
    it('should accept baseUrl and optional cache', () => {
      expect(new MCPRegistryClient(TEST_CONSTANTS.BASE_URL)).toBeDefined();
      expect(
        new MCPRegistryClient(TEST_CONSTANTS.BASE_URL, mockCache),
      ).toBeDefined();
      expect(
        new MCPRegistryClient(TEST_CONSTANTS.CUSTOM_URL, mockCache),
      ).toBeDefined();
    });
  });

  describe('searchServers', () => {
    const testCases = [
      {
        name: 'should make correct API call and return results',
        setup: () => httpMock.mockSuccessfulSearch([MOCK_SERVERS.BASIC]),
        query: 'test query',
        cache: noOpCache,
        expectedResult: [MOCK_SERVERS.BASIC],
        expectsHttp: true,
      },
      {
        name: 'should return empty array when no servers found',
        setup: () => httpMock.mockEmptySearch(),
        query: 'nonexistent',
        cache: noOpCache,
        expectedResult: [],
        expectsHttp: true,
      },
      // NOTE: Cache hit test moved to separate test below
    ];

    testCases.forEach((testCase) => {
      it(testCase.name, async () => {
        await testCase.setup();

        // For cache hit tests, ensure mock fetch is cleared and won't be called
        if (!testCase.expectsHttp) {
          mockFetch.mockClear();
        }

        const client = new MCPRegistryClient(
          TEST_CONSTANTS.BASE_URL,
          testCase.cache,
        );
        const result = await client.searchServers(testCase.query);

        if (testCase.expectsHttp) {
          AssertionHelper.assertSingleHttpRequest(mockFetch);
        } else {
          AssertionHelper.assertNoHttpRequests(mockFetch);
        }
        expect(result).toEqual(testCase.expectedResult);
      });
    });

    it('should use cache when available (cache hit)', async () => {
      const cachedResults = [MOCK_SERVERS.CACHED];
      const cacheKey = `${TEST_CONSTANTS.BASE_URL}:search:cached query`;
      await mockCache.set(cacheKey, cachedResults);

      const client = new MCPRegistryClient(TEST_CONSTANTS.BASE_URL, mockCache);
      const result = await client.searchServers('cached query');

      AssertionHelper.assertNoHttpRequests(mockFetch);
      expect(result).toEqual(cachedResults);
    });

    it('should store results in cache after successful fetch', async () => {
      httpMock.mockSuccessfulSearch([MOCK_SERVERS.BASIC]);
      const client = new MCPRegistryClient(TEST_CONSTANTS.BASE_URL, mockCache);
      await client.searchServers('new query');
      await CacheTestHelper.assertCacheStored(
        mockCache,
        TEST_CONSTANTS.BASE_URL,
        'search:new query',
        [MOCK_SERVERS.BASIC],
      );
    });

    // Error scenarios
    [...TEST_SCENARIOS.NETWORK_ERRORS, ...TEST_SCENARIOS.HTTP_ERRORS].forEach(
      (scenario) => {
        it(`should throw on ${scenario.name}`, async () => {
          if ('error' in scenario) {
            httpMock.mockNetworkError(scenario.error);
          } else {
            httpMock.mockHttpError(scenario.status, scenario.statusText);
          }
          const client = new MCPRegistryClient(
            TEST_CONSTANTS.BASE_URL,
            mockCache,
          );
          await AssertionHelper.assertErrorThrown(
            client.searchServers('test'),
            scenario.expectedMessage,
          );
        });
      },
    );
  });

  describe('getServer', () => {
    const getServerTests = [
      [
        'find by name',
        () => httpMock.mockSuccessfulSearch([MOCK_SERVERS.DETAILED]),
        'Test Server',
        noOpCache,
        MOCK_SERVERS.DETAILED,
        true,
      ],
      [
        'return null for non-existent',
        () => httpMock.mockEmptySearch(),
        'nonexistent',
        noOpCache,
        null,
        true,
      ],
      // NOTE: Cache hit test moved to separate test below
    ] as const;

    getServerTests.forEach(
      ([name, setup, identifier, cache, expectedResult, expectsHttp]) => {
        it(`should ${name}`, async () => {
          await setup();

          // For cache hit tests, ensure mock fetch is cleared and won't be called
          if (!expectsHttp) {
            mockFetch.mockClear();
          }

          const client = new MCPRegistryClient(TEST_CONSTANTS.BASE_URL, cache);
          const result = await client.getServer(identifier);
          expectsHttp
            ? AssertionHelper.assertSingleHttpRequest(mockFetch)
            : AssertionHelper.assertNoHttpRequests(mockFetch);
          expectedResult
            ? AssertionHelper.assertServerResult(result, expectedResult)
            : AssertionHelper.assertNotFound(result);
        });
      },
    );

    it('should use cache when available', async () => {
      const cachedServer = MOCK_SERVERS.CACHED;
      const cacheKey = `${TEST_CONSTANTS.BASE_URL}:server:cached-server`;
      await mockCache.set(cacheKey, cachedServer);

      const client = new MCPRegistryClient(TEST_CONSTANTS.BASE_URL, mockCache);
      const result = await client.getServer('cached-server');

      AssertionHelper.assertNoHttpRequests(mockFetch);
      AssertionHelper.assertServerResult(result, cachedServer);
    });

    it('should store in cache after fetch', async () => {
      httpMock.mockSuccessfulSearch([MOCK_SERVERS.BASIC]);
      const client = new MCPRegistryClient(TEST_CONSTANTS.BASE_URL, mockCache);
      await client.getServer('Test Server 1');
      await CacheTestHelper.assertCacheStored(
        mockCache,
        TEST_CONSTANTS.BASE_URL,
        'Test Server 1',
        MOCK_SERVERS.BASIC,
      );
    });

    [
      [
        'network errors',
        () => httpMock.mockNetworkError(new Error('Network error')),
        'Network error',
      ],
      [
        'HTTP errors',
        () => httpMock.mockHttpError(500, 'Internal Server Error'),
        'Registry search failed: 500 Internal Server Error',
      ],
    ].forEach(([name, setup, expectedMessage]) => {
      it(`should throw on ${name}`, async () => {
        setup();
        const client = new MCPRegistryClient(
          TEST_CONSTANTS.BASE_URL,
          mockCache,
        );
        await AssertionHelper.assertErrorThrown(
          client.getServer('test-server'),
          expectedMessage,
        );
      });
    });
  });

  describe('UUID detection and routing', () => {
    beforeEach(() => vi.clearAllMocks());

    const uuidTests = [
      [
        'valid UUID (direct)',
        TEST_CONSTANTS.VALID_UUID,
        () => httpMock.mockSuccessfulServerFetch(MOCK_SERVERS.UUID_SERVER),
        true,
        MOCK_SERVERS.UUID_SERVER,
      ],
      [
        'uppercase UUID (direct)',
        TEST_CONSTANTS.UPPERCASE_UUID,
        () => httpMock.mockSuccessfulServerFetch(MOCK_SERVERS.UUID_SERVER),
        true,
        MOCK_SERVERS.UUID_SERVER,
      ],
      [
        'non-UUID (search)',
        'github-mcp-server',
        () =>
          httpMock.mockSuccessfulSearch([
            MOCK_SERVERS.GITHUB,
            MOCK_SERVERS.OTHER,
          ]),
        false,
        MOCK_SERVERS.GITHUB,
      ],
      [
        '404 UUID lookup',
        TEST_CONSTANTS.NOT_FOUND_UUID,
        () => httpMock.mockNotFound(),
        true,
        null,
      ],
    ] as const;

    uuidTests.forEach(([name, uuid, setup, expectDirect, expectedResult]) => {
      it(`should handle ${name}`, async () => {
        setup();
        const client = new MCPRegistryClient(
          TEST_CONSTANTS.BASE_URL,
          noOpCache,
        );
        const result = await client.getServer(uuid);
        expectDirect
          ? AssertionHelper.assertDirectEndpointCalled(
              mockFetch,
              TEST_CONSTANTS.BASE_URL,
              uuid,
            )
          : AssertionHelper.assertSearchEndpointCalled(
              mockFetch,
              TEST_CONSTANTS.BASE_URL,
              uuid,
              uuid,
            );
        expectedResult
          ? AssertionHelper.assertServerResult(result, expectedResult)
          : AssertionHelper.assertNotFound(result);
      });
    });

    // Malformed UUIDs use search
    TEST_SCENARIOS.UUID_FORMATS.filter(
      (s) => !s.shouldUseDirectEndpoint,
    ).forEach((scenario) => {
      it(`should handle ${scenario.name} via search`, async () => {
        httpMock.mockEmptySearch();
        const client = new MCPRegistryClient(
          TEST_CONSTANTS.BASE_URL,
          noOpCache,
        );
        const result = await client.getServer(scenario.uuid);
        AssertionHelper.assertSearchEndpointCalled(
          mockFetch,
          TEST_CONSTANTS.BASE_URL,
          scenario.uuid,
          encodeURIComponent(scenario.uuid),
        );
        AssertionHelper.assertNotFound(result);
      });
    });

    it('should throw on server errors for UUID direct endpoint', async () => {
      httpMock.mockHttpError(500, 'Internal Server Error');
      const client = new MCPRegistryClient(TEST_CONSTANTS.BASE_URL, noOpCache);
      await AssertionHelper.assertErrorThrown(
        client.getServer(TEST_CONSTANTS.SERVER_ERROR_UUID),
        'Registry server fetch failed: 500 Internal Server Error',
      );
    });
  });

  describe('cache behavior', () => {
    it('should respect cache TTL', async () => {
      const serverDetail = MOCK_SERVERS.TTL_TEST;
      await CacheTestHelper.populateCache(
        mockCache,
        TEST_CONSTANTS.BASE_URL,
        'TTL Server',
        serverDetail,
        100,
      );

      const client = new MCPRegistryClient(TEST_CONSTANTS.BASE_URL, mockCache);
      let result = await client.getServer('TTL Server');
      AssertionHelper.assertServerResult(result, serverDetail);
      AssertionHelper.assertNoHttpRequests(mockFetch);

      await new Promise((resolve) => setTimeout(resolve, 150)); // Wait for TTL
      httpMock.mockSuccessfulSearch([serverDetail]);
      result = await client.getServer('TTL Server');
      AssertionHelper.assertServerResult(result, serverDetail);
      AssertionHelper.assertSingleHttpRequest(mockFetch);
    });
  });

  describe('error handling and edge cases', () => {
    [
      ['malformed JSON', () => httpMock.mockJsonError(), 'Invalid JSON'],
      [
        'empty responses',
        () => httpMock.mockNullResponse(),
        "Cannot read properties of null (reading 'servers')",
      ],
    ].forEach(([name, setup, expectedMessage]) => {
      it(`should handle ${name}`, async () => {
        setup();
        const client = new MCPRegistryClient(
          TEST_CONSTANTS.BASE_URL,
          noOpCache,
        );
        await AssertionHelper.assertErrorThrown(
          client.searchServers('test'),
          expectedMessage,
        );
      });
    });

    // Query encoding tests
    TEST_SCENARIOS.SEARCH_QUERIES.forEach((scenario) => {
      it(`should encode ${scenario.name}`, async () => {
        httpMock.mockEmptySearch();
        const client = new MCPRegistryClient(
          TEST_CONSTANTS.BASE_URL,
          noOpCache,
        );
        await client.searchServers(scenario.query);
        AssertionHelper.assertSearchEndpointCalled(
          mockFetch,
          TEST_CONSTANTS.BASE_URL,
          scenario.query,
          scenario.encoded,
        );
      });
    });

    it('should handle concurrent requests (dedup seam)', async () => {
      const serverDetail = MOCK_SERVERS.CONCURRENT;
      let fetchCallCount = 0;
      mockFetch.mockImplementation(async () => {
        fetchCallCount++;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          ok: true,
          json: async () => ({
            servers: [serverDetail],
            metadata: { count: 1, next_cursor: null },
          }),
        };
      });

      const client = new MCPRegistryClient(TEST_CONSTANTS.BASE_URL, mockCache);
      const results = await Promise.all([
        client.getServer('Concurrent Server'),
        client.getServer('Concurrent Server'),
        client.getServer('Concurrent Server'),
      ]);

      expect(fetchCallCount).toBe(1); // Deduplication
      expect(results).toHaveLength(3);
      results.forEach((result) =>
        AssertionHelper.assertServerResult(result, serverDetail),
      );
    });
  });
});
