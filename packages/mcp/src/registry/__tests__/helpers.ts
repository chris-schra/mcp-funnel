/**
 * Test helper utilities for registry client tests.
 *
 * This file provides reusable utilities for HTTP mocking, response setup,
 * and common assertions. These helpers reduce test duplication and provide
 * a consistent testing interface across the test suite.
 */

import { vi } from 'vitest';
import type { ServerDetail } from '../types/registry.types.js';
import { MOCK_RESPONSES, TEST_CONSTANTS, CACHE_KEYS } from './fixtures.js';

/**
 * HTTP mock response structure for Vitest mocks.
 */
export interface MockResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json: () => Promise<unknown>;
}

/**
 * Utility class for setting up HTTP mocks in tests.
 * Provides a fluent interface for configuring different response scenarios.
 */
export class HttpMockHelper {
  constructor(private mockFetch: ReturnType<typeof vi.fn>) {}

  /**
   * Sets up a successful search response with the given servers.
   */
  mockSuccessfulSearch(servers: ServerDetail[]): void {
    const response = MOCK_RESPONSES.createSearchResponse(servers);
    this.mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => response,
    });
  }

  /**
   * Sets up an empty search response (no servers found).
   */
  mockEmptySearch(): void {
    this.mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => MOCK_RESPONSES.EMPTY_SEARCH,
    });
  }

  /**
   * Sets up a successful direct server response.
   */
  mockSuccessfulServerFetch(server: ServerDetail): void {
    this.mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => server,
    });
  }

  /**
   * Sets up an HTTP error response.
   */
  mockHttpError(status: number, statusText: string): void {
    this.mockFetch.mockResolvedValueOnce({
      ok: false,
      status,
      statusText,
    });
  }

  /**
   * Sets up a 404 not found response.
   */
  mockNotFound(): void {
    this.mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    });
  }

  /**
   * Sets up a network error.
   */
  mockNetworkError(error: Error): void {
    this.mockFetch.mockRejectedValueOnce(error);
  }

  /**
   * Sets up a JSON parsing error.
   */
  mockJsonError(): void {
    this.mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('Invalid JSON');
      },
    });
  }

  /**
   * Sets up a null response (malformed API response).
   */
  mockNullResponse(): void {
    this.mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => null,
    });
  }

  /**
   * Sets up a delayed response for concurrency testing.
   */
  mockDelayedResponse(server: ServerDetail, delayMs: number = 50): void {
    this.mockFetch.mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return {
        ok: true,
        status: 200,
        json: async () => MOCK_RESPONSES.createSearchResponse([server]),
      };
    });
  }
}

/**
 * Utility class for common test assertions and validations.
 */
export class AssertionHelper {
  /**
   * Asserts that the correct search endpoint was called with proper encoding.
   */
  static assertSearchEndpointCalled(
    mockFetch: ReturnType<typeof vi.fn>,
    baseUrl: string,
    query: string,
    encodedQuery: string,
  ): void {
    expect(mockFetch).toHaveBeenCalledWith(
      `${baseUrl}/v0/servers?search=${encodedQuery}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'application/json',
        }),
      }),
    );
  }

  /**
   * Asserts that the correct direct server endpoint was called.
   */
  static assertDirectEndpointCalled(
    mockFetch: ReturnType<typeof vi.fn>,
    baseUrl: string,
    uuid: string,
  ): void {
    expect(mockFetch).toHaveBeenCalledWith(
      `${baseUrl}/v0/servers/${uuid}`,
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Accept: 'application/json',
          'Content-Type': 'application/json',
        }),
      }),
    );
  }

  /**
   * Asserts that no HTTP requests were made (cache hit scenario).
   */
  static assertNoHttpRequests(mockFetch: ReturnType<typeof vi.fn>): void {
    expect(mockFetch).not.toHaveBeenCalled();
  }

  /**
   * Asserts that exactly one HTTP request was made.
   */
  static assertSingleHttpRequest(mockFetch: ReturnType<typeof vi.fn>): void {
    expect(mockFetch).toHaveBeenCalledTimes(1);
  }

  /**
   * Asserts that an error was thrown with the expected message.
   */
  static async assertErrorThrown(
    operation: Promise<unknown>,
    expectedMessage: string,
  ): Promise<void> {
    await expect(operation).rejects.toThrow(expectedMessage);
  }

  /**
   * Asserts that the result matches the expected server.
   */
  static assertServerResult(
    result: ServerDetail | null,
    expected: ServerDetail,
  ): void {
    expect(result).toEqual(expected);
  }

  /**
   * Asserts that the result is null (server not found).
   */
  static assertNotFound(result: ServerDetail | null): void {
    expect(result).toBeNull();
  }

  /**
   * Asserts that the result is an empty array.
   */
  static assertEmptyResults(result: ServerDetail[]): void {
    expect(result).toEqual([]);
  }
}

/**
 * Utility class for cache-related test operations.
 */
export class CacheTestHelper {
  /**
   * Pre-populates cache with test data.
   */
  static async populateCache(
    cache: any,
    baseUrl: string,
    key: string,
    data: unknown,
    ttl?: number,
  ): Promise<void> {
    await cache.set(this.getCacheKey(baseUrl, key), data, ttl);
  }

  /**
   * Verifies that data was stored in cache.
   */
  static async assertCacheStored(
    cache: any,
    baseUrl: string,
    key: string,
    expectedData: unknown,
  ): Promise<void> {
    const cachedResult = await cache.get(this.getCacheKey(baseUrl, key));
    expect(cachedResult).toEqual(expectedData);
  }

  /**
   * Verifies that cache is empty for a given key.
   */
  static async assertCacheEmpty(
    cache: any,
    baseUrl: string,
    key: string,
  ): Promise<void> {
    const cachedResult = await cache.get(this.getCacheKey(baseUrl, key));
    expect(cachedResult).toBeNull();
  }

  /**
   * Gets the appropriate cache key for search operations.
   */
  static getSearchCacheKey(baseUrl: string, query: string): string {
    return CACHE_KEYS.search(baseUrl, query);
  }

  /**
   * Gets the appropriate cache key for server operations.
   */
  static getServerCacheKey(baseUrl: string, identifier: string): string {
    return CACHE_KEYS.server(baseUrl, identifier);
  }

  /**
   * Helper to get cache key based on operation type.
   */
  private static getCacheKey(baseUrl: string, key: string): string {
    // If key contains search patterns, use search cache key
    if (key.includes('search:')) {
      const query = key.split('search:')[1];
      return this.getSearchCacheKey(baseUrl, query);
    }
    // Otherwise, treat as server cache key
    return this.getServerCacheKey(baseUrl, key);
  }

  /**
   * Direct cache key setter for precise cache key control.
   */
  static async populateCacheWithExactKey(
    cache: any,
    cacheKey: string,
    data: unknown,
    ttl?: number,
  ): Promise<void> {
    await cache.set(cacheKey, data, ttl);
  }
}

/**
 * Factory function to create HttpMockHelper instance.
 */
export function createHttpMockHelper(
  mockFetch: ReturnType<typeof vi.fn>,
): HttpMockHelper {
  return new HttpMockHelper(mockFetch);
}

/**
 * Parameterized test helper for running the same test with different scenarios.
 */
export function runParameterizedTests<T>(
  scenarios: readonly T[],
  testFn: (scenario: T) => void | Promise<void>,
): void {
  scenarios.forEach((scenario) => {
    testFn(scenario);
  });
}

/**
 * Creates a test client factory for consistent client instantiation.
 */
export function createClientFactory(baseUrl: string = TEST_CONSTANTS.BASE_URL) {
  return {
    withCache: (cache: any) => ({ baseUrl, cache }),
    withoutCache: () => ({ baseUrl, cache: null }),
  };
}
