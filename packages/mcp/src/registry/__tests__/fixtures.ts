/**
 * Test fixtures and mock data for registry client tests.
 *
 * This file contains all mock server data, response structures, and test constants
 * used across the registry client test suite. Extracting these reduces test file
 * complexity and ensures consistency across different test scenarios.
 */

import type { ServerDetail } from '../types/registry.types.js';

/**
 * Test constants and URLs used throughout the test suite.
 */
export const TEST_CONSTANTS = {
  BASE_URL: 'https://registry.modelcontextprotocol.io',
  CUSTOM_URL: 'https://custom.registry.com',
  VALID_UUID: 'a8a5c761-c1dc-4d1d-9100-b57df4c9ec0d',
  UPPERCASE_UUID: 'A8A5C761-C1DC-4D1D-9100-B57DF4C9EC0D',
  NOT_FOUND_UUID: '550e8400-e29b-41d4-a716-446655440000',
  SERVER_ERROR_UUID: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
  MALFORMED_UUID: 'a8a5c761-c1dc-4d1d-9100-g57df4c9ec0d',
  NO_HYPHENS_UUID: 'a8a5c761c1dc4d1d9100b57df4c9ec0d',
} as const;

/**
 * Base server metadata structure used across multiple fixtures.
 */
const createServerMeta = (id: string) => ({
  'io.modelcontextprotocol.registry/official': {
    id,
    published_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  },
});

/**
 * Test server fixtures with various configurations.
 */
export const MOCK_SERVERS = {
  /**
   * Basic test server with minimal configuration.
   */
  BASIC: {
    id: 'test-server-1',
    _meta: createServerMeta('test-server-1-registry-id'),
    name: 'Test Server 1',
    description: 'A test server for demonstration',
    packages: [
      {
        identifier: 'test-server-1',
        registry_type: 'npm' as const,
      },
    ],
  } satisfies ServerDetail,

  /**
   * Server with full configuration including tools and runtime arguments.
   */
  DETAILED: {
    id: 'test-server',
    _meta: createServerMeta('test-server-registry-id'),
    name: 'Test Server',
    description: 'Detailed test server information',
    packages: [
      {
        identifier: 'test-server',
        registry_type: 'npm' as const,
        runtime_hint: 'node',
        package_arguments: ['--verbose'],
      },
    ],
    tools: ['tool1', 'tool2'],
  } satisfies ServerDetail,

  /**
   * GitHub server fixture for name-based search tests.
   */
  GITHUB: {
    id: 'github-server-id',
    _meta: createServerMeta('github-server-registry-id'),
    name: 'github-mcp-server',
    description: 'GitHub MCP Server',
    packages: [
      {
        identifier: 'github-mcp-server',
        registry_type: 'npm' as const,
      },
    ],
  } satisfies ServerDetail,

  /**
   * UUID-based server for direct endpoint tests.
   */
  UUID_SERVER: {
    id: TEST_CONSTANTS.VALID_UUID,
    _meta: createServerMeta(TEST_CONSTANTS.VALID_UUID),
    name: 'test-server',
    description: 'Test server',
    packages: [
      {
        identifier: 'test-server',
        registry_type: 'npm' as const,
      },
    ],
  } satisfies ServerDetail,

  /**
   * Cached server fixture for cache-related tests.
   */
  CACHED: {
    id: 'cached-server',
    _meta: createServerMeta('cached-server-registry-id'),
    name: 'Cached Server',
    description: 'Server from cache',
  } satisfies ServerDetail,

  /**
   * Server for TTL testing with cache.
   */
  TTL_TEST: {
    id: 'ttl-server',
    _meta: createServerMeta('ttl-server-registry-id'),
    name: 'TTL Server',
    description: 'Server for TTL testing',
  } satisfies ServerDetail,

  /**
   * Server for concurrency testing.
   */
  CONCURRENT: {
    id: 'concurrent-server',
    _meta: createServerMeta('concurrent-server-registry-id'),
    name: 'Concurrent Server',
    description: 'Server for concurrency testing',
  } satisfies ServerDetail,

  /**
   * Additional server for search result lists.
   */
  OTHER: {
    id: 'other-server-id',
    _meta: createServerMeta('other-server-registry-id'),
    name: 'other-server',
    description: 'Other server',
  } satisfies ServerDetail,
} as const;

/**
 * Mock API response structures for different endpoints.
 */
export const MOCK_RESPONSES = {
  /**
   * Creates a search response with the given servers.
   */
  createSearchResponse: (servers: ServerDetail[]) => ({
    servers,
    metadata: {
      count: servers.length,
      next_cursor: null,
    },
  }),

  /**
   * Empty search response for "not found" scenarios.
   */
  EMPTY_SEARCH: {
    servers: [],
    metadata: {
      count: 0,
      next_cursor: null,
    },
  },

  /**
   * Response with pagination metadata.
   */
  PAGINATED_SEARCH: {
    servers: [MOCK_SERVERS.BASIC],
    metadata: {
      count: 1,
      next_cursor: null,
    },
  },
} as const;

/**
 * Common test scenarios for parameterized testing.
 */
export const TEST_SCENARIOS = {
  /**
   * Error scenarios for testing different HTTP error responses.
   */
  HTTP_ERRORS: [
    {
      name: 'HTTP 500 error',
      status: 500,
      statusText: 'Internal Server Error',
      expectedMessage: 'Registry search failed: 500 Internal Server Error',
    },
    {
      name: 'HTTP 503 error',
      status: 503,
      statusText: 'Service Unavailable',
      expectedMessage: 'Registry search failed: 503 Service Unavailable',
    },
  ],

  /**
   * Network error scenarios.
   */
  NETWORK_ERRORS: [
    {
      name: 'Network connection error',
      error: new Error('Network error'),
      expectedMessage: 'Network error',
    },
    {
      name: 'Fetch timeout error',
      error: new TypeError('fetch failed'),
      expectedMessage: 'fetch failed',
    },
  ],

  /**
   * UUID format test cases.
   */
  UUID_FORMATS: [
    {
      name: 'Valid lowercase UUID',
      uuid: TEST_CONSTANTS.VALID_UUID,
      shouldUseDirectEndpoint: true,
    },
    {
      name: 'Valid uppercase UUID',
      uuid: TEST_CONSTANTS.UPPERCASE_UUID,
      shouldUseDirectEndpoint: true,
    },
    {
      name: 'Malformed UUID (invalid character)',
      uuid: TEST_CONSTANTS.MALFORMED_UUID,
      shouldUseDirectEndpoint: false,
    },
    {
      name: 'UUID without hyphens',
      uuid: TEST_CONSTANTS.NO_HYPHENS_UUID,
      shouldUseDirectEndpoint: false,
    },
  ],

  /**
   * Search query encoding test cases.
   */
  SEARCH_QUERIES: [
    {
      name: 'Simple query',
      query: 'test',
      encoded: 'test',
    },
    {
      name: 'Query with spaces',
      query: 'test query',
      encoded: 'test%20query',
    },
    {
      name: 'Query with special characters',
      query: 'test query with spaces & special chars!',
      encoded: 'test%20query%20with%20spaces%20%26%20special%20chars!',
    },
  ],
} as const;

/**
 * Cache key generators for testing cache behavior.
 */
export const CACHE_KEYS = {
  search: (baseUrl: string, query: string) => `${baseUrl}:search:${query}`,
  server: (baseUrl: string, identifier: string) =>
    `${baseUrl}:server:${identifier}`,
} as const;
