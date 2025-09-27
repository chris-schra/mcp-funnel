/**
 * Test utilities for registry integration tests.
 * Contains common setup, mocking patterns, and assertion helpers.
 */

import { vi } from 'vitest';
import type { ServerDetail } from '../types/registry.types.js';
import type { ProxyConfig } from '../../config.js';

export interface MockFetchResponse {
  ok: boolean;
  status?: number;
  statusText?: string;
  json: () => Promise<unknown>;
}

export interface RegistrySearchResponse {
  servers: ServerDetail[];
  metadata: { count: number; next_cursor: string | null };
}

/**
 * Creates a mock ProxyConfig for testing
 */
export const createMockProxyConfig = (): ProxyConfig =>
  ({
    servers: [],
    registries: ['https://registry.modelcontextprotocol.io'],
  }) as ProxyConfig;

/**
 * Creates a successful search response mock
 */
export const createSuccessResponse = (
  servers: ServerDetail[],
): MockFetchResponse => ({
  ok: true,
  json: async () => ({
    servers,
    metadata: { count: servers.length, next_cursor: null },
  }),
});

/**
 * Creates an empty search response mock
 */
export const createEmptyResponse = (): MockFetchResponse => ({
  ok: true,
  json: async () => ({
    servers: [],
    metadata: { count: 0, next_cursor: null },
  }),
});

/**
 * Creates an error response mock
 */
export const createErrorResponse = (
  status: number,
  statusText: string,
): MockFetchResponse => ({
  ok: false,
  status,
  statusText,
  json: async () => ({}),
});

/**
 * Creates a network error mock
 */
export const createNetworkError = (): Error => new Error('Network error');

/**
 * Creates a malformed JSON response mock
 */
export const createMalformedResponse = (): MockFetchResponse => ({
  ok: true,
  json: async () => {
    throw new Error('Invalid JSON');
  },
});

/**
 * Sets up fetch mock for a single server scenario
 */
export const mockSingleServerFlow = (
  mockFetch: ReturnType<typeof vi.fn>,
  server: ServerDetail,
): void => {
  // Mock search response
  mockFetch.mockResolvedValueOnce(createSuccessResponse([server]));
  // Mock getServer response (search is called internally)
  mockFetch.mockResolvedValueOnce(createSuccessResponse([server]));
};

/**
 * Sets up fetch mock for UUID lookup
 */
export const mockUuidLookup = (
  mockFetch: ReturnType<typeof vi.fn>,
  uuid: string,
  server: ServerDetail | null,
): void => {
  mockFetch.mockImplementation(async (url) => {
    const urlStr = typeof url === 'string' ? url : url.toString();

    if (urlStr.includes(`/v0/servers/${uuid}`)) {
      if (server === null) {
        return createErrorResponse(404, 'Not Found');
      }
      return {
        ok: true,
        status: 200,
        json: async () => server,
      };
    }

    throw new Error(`Unexpected fetch: ${urlStr}`);
  });
};

/**
 * Sets up fetch mock for error scenarios
 */
export const mockErrorScenario = (
  mockFetch: ReturnType<typeof vi.fn>,
  scenario: 'network' | 'server-error' | 'not-found' | 'malformed',
): void => {
  switch (scenario) {
    case 'network':
      mockFetch.mockRejectedValueOnce(createNetworkError());
      break;
    case 'server-error':
      mockFetch.mockResolvedValueOnce(
        createErrorResponse(500, 'Internal Server Error'),
      );
      break;
    case 'not-found':
      mockFetch.mockResolvedValueOnce(createErrorResponse(404, 'Not Found'));
      break;
    case 'malformed':
      mockFetch.mockResolvedValueOnce(createMalformedResponse());
      break;
  }
};

/**
 * Parameterized test helper for config generation validation
 */
export interface ConfigTestCase<T = unknown> {
  name: string;
  server: T;
  expected: {
    command?: string;
    args?: string[];
    env?: Record<string, string>;
    transport?: string;
    url?: string;
    headers?: unknown;
  };
}

/**
 * Runs a parameterized config test case
 */
export const runConfigTest = <T>(
  testCase: ConfigTestCase<T>,
  configGenerator: (server: T) => unknown,
): void => {
  const config = configGenerator(testCase.server) as Record<string, unknown>;

  if (testCase.expected.command) {
    expect(config.command).toBe(testCase.expected.command);
  }
  if (testCase.expected.args) {
    expect(config.args).toEqual(testCase.expected.args);
  }
  if (testCase.expected.env) {
    expect(config.env).toEqual(testCase.expected.env);
  }
  if (testCase.expected.transport) {
    expect(config.transport).toBe(testCase.expected.transport);
  }
  if (testCase.expected.url) {
    expect(config.url).toBe(testCase.expected.url);
  }
  if (testCase.expected.headers) {
    expect(config.headers).toEqual(testCase.expected.headers);
  }
};

/**
 * Full flow test helper
 */
export interface FullFlowTestCase {
  name: string;
  server: ServerDetail;
  searchTerm: string;
  expectedResults: {
    searchFound: boolean;
    serverName: string;
    configCommand?: string;
    configArgs?: string[];
    configEnv?: Record<string, string>;
    installInstructions?: string[];
  };
}

/**
 * Assertion helpers for common test patterns
 */
export const assertSearchResult = (
  result: { found: boolean; servers?: unknown[]; message: string },
  expected: { found: boolean; count?: number; message?: string },
): void => {
  expect(result.found).toBe(expected.found);
  if (expected.count !== undefined) {
    expect(result.servers).toHaveLength(expected.count);
  }
  if (expected.message) {
    expect(result.message).toContain(expected.message);
  }
};

/**
 * Assertion helpers for error scenarios
 */
export const assertErrorResult = (result: {
  found: boolean;
  servers: unknown[];
  message: string;
}): void => {
  assertSearchResult(result, { found: false, count: 0 });
  expect(result.message).toContain('Registry errors');
};

/**
 * Configuration validation helpers
 */
export interface ConfigAssertion {
  command?: string;
  argsPattern?: string[] | { contains: string[] } | { startsWith: string[] };
  env?: Record<string, string> | { excludes: string[] };
  transport?: string;
  url?: string;
  headerCheck?: 'array' | 'object' | { hasProperty: string };
}

export const assertConfig = (
  config: Record<string, unknown>,
  assertions: ConfigAssertion,
): void => {
  if (assertions.command) {
    expect(config.command).toBe(assertions.command);
  }

  if (assertions.argsPattern) {
    const args = config.args as string[];
    if (Array.isArray(assertions.argsPattern)) {
      expect(args).toEqual(assertions.argsPattern);
    } else if ('contains' in assertions.argsPattern) {
      assertions.argsPattern.contains.forEach((arg) => {
        expect(args).toContain(arg);
      });
    } else if ('startsWith' in assertions.argsPattern) {
      assertions.argsPattern.startsWith.forEach((arg, index) => {
        expect(args[index]).toBe(arg);
      });
    }
  }

  if (assertions.env) {
    if ('excludes' in assertions.env) {
      assertions.env.excludes.forEach((key) => {
        expect(config.env).not.toHaveProperty(key);
      });
    } else {
      expect(config.env).toEqual(assertions.env);
    }
  }

  if (assertions.transport) {
    expect(config.transport).toBe(assertions.transport);
  }

  if (assertions.url) {
    expect(config.url).toBe(assertions.url);
  }

  if (assertions.headerCheck) {
    if (assertions.headerCheck === 'array') {
      expect(Array.isArray(config.headers)).toBe(true);
    } else if (assertions.headerCheck === 'object') {
      expect(typeof config.headers).toBe('object');
    } else if ('hasProperty' in assertions.headerCheck) {
      const headers = config.headers as Record<string, unknown>;
      expect(headers).toHaveProperty(assertions.headerCheck.hasProperty);
    }
  }
};
