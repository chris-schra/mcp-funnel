import { vi, expect } from 'vitest';
import type { ProxyConfig } from '../../config.js';
import { RegistryContext } from '../registry-context.js';
import { mockResponses } from '../test-fixtures/registry-context.fixtures.js';

// Types for test assertions
interface SearchResult {
  found: boolean;
  servers?: Array<{ name: string }>;
  message: string;
}

interface ServerDetails {
  name?: string;
  tools?: string[];
}

interface ConfigResult {
  name: string;
}

interface InstallInfo {
  name: string;
  configSnippet: unknown;
  installInstructions: unknown;
}

/**
 * Test helpers for registry context tests
 */

// Mock setup helpers
export const setupMocks = () => {
  vi.mock('node:fs/promises', () => ({
    readFile: vi.fn(),
    writeFile: vi.fn(),
  }));

  const mockFetch = vi.fn();
  global.fetch = mockFetch;
  return mockFetch;
};

export const setupDefaultMockResponse = (
  mockFetch: ReturnType<typeof vi.fn>,
) => {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(mockResponses.empty),
  });
};

export const setupSuccessResponse = (
  mockFetch: ReturnType<typeof vi.fn>,
  response: unknown,
) => {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(response),
  });
};

export const setupErrorResponse = (
  mockFetch: ReturnType<typeof vi.fn>,
  error: Error,
) => {
  mockFetch.mockRejectedValue(error);
};

export const setup404Response = (mockFetch: ReturnType<typeof vi.fn>) => {
  mockFetch.mockResolvedValue({
    ok: false,
    status: 404,
    statusText: 'Not Found',
    json: () => Promise.resolve({}),
  });
};

// Registry context helpers
export const resetRegistryContext = () => {
  RegistryContext.reset();
  vi.clearAllMocks();
};

export const createRegistryContext = (config: ProxyConfig) => {
  return RegistryContext.getInstance(config);
};

export const getRegistryContextInstance = () => {
  return RegistryContext.getInstance();
};

// Assertion helpers
export const assertSearchResult = (
  result: SearchResult,
  expected: {
    found: boolean;
    serverCount: number;
    messageIncludes?: string;
    serverName?: string;
  },
) => {
  expect(result.found).toBe(expected.found);
  expect(result.servers).toHaveLength(expected.serverCount);

  if (expected.messageIncludes) {
    expect(result.message).toContain(expected.messageIncludes);
  }

  if (expected.serverName && result.servers && result.servers.length > 0) {
    expect(result.servers[0]?.name).toBe(expected.serverName);
  }
};

export const assertServerDetails = (
  details: ServerDetails | null,
  expected: {
    shouldExist: boolean;
    name?: string;
    toolIncludes?: string;
  },
) => {
  if (expected.shouldExist) {
    expect(details).not.toBeNull();
    if (expected.name && details) {
      expect(details.name).toBe(expected.name);
    }
    if (expected.toolIncludes && details) {
      expect(details.tools).toContain(expected.toolIncludes);
    }
  } else {
    expect(details).toBeNull();
  }
};

export const assertTemporaryServer = (serverId: string) => {
  expect(serverId).toBeDefined();
  expect(typeof serverId).toBe('string');
  expect(serverId.length).toBeGreaterThan(0);
};

export const assertConfigGeneration = (
  config: ConfigResult,
  serverName: string,
) => {
  expect(config).toBeDefined();
  expect(config.name).toBe(serverName);
};

export const assertInstallInfo = (
  installInfo: InstallInfo,
  serverName: string,
) => {
  expect(installInfo).toBeDefined();
  expect(installInfo.name).toBe(serverName);
  expect(installInfo.configSnippet).toBeDefined();
  expect(installInfo.installInstructions).toBeDefined();
};

export const assertFetchCall = (
  mockFetch: ReturnType<typeof vi.fn>,
  urlContains: string,
) => {
  expect(mockFetch).toHaveBeenCalledWith(
    expect.stringContaining(urlContains),
    expect.any(Object),
  );
};

export const assertNoFetchCall = (mockFetch: ReturnType<typeof vi.fn>) => {
  expect(mockFetch).not.toHaveBeenCalled();
};

// Test lifecycle helpers
export const beforeEachSetup = (mockFetch: ReturnType<typeof vi.fn>) => {
  resetRegistryContext();
  setupDefaultMockResponse(mockFetch);
};

export const afterEachCleanup = () => {
  resetRegistryContext();
};

// Parameterized test helpers
export const runParameterizedTest = async <T>(
  testCases: T[],
  testFunction: (testCase: T) => Promise<void>,
) => {
  for (const testCase of testCases) {
    await testFunction(testCase);
  }
};

// Concurrent test helpers
export const runConcurrentTests = async (promises: Promise<unknown>[]) => {
  const results = await Promise.all(promises);
  expect(results).toHaveLength(promises.length);
  results.forEach((result) => {
    expect(result).toBeDefined();
  });
  return results;
};
