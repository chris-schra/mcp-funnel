import { SimpleCache } from './cache.js';
import type {
  PackageInfo,
  SearchResults,
  NPMPackageResponse,
  NPMSearchResponse,
} from './types.js';
import { MAX_SEARCH_RESULTS } from './types.js';
import {
  transformPackageResponse,
  transformSearchResponse,
} from './util/index.js';

/**
 * Configuration options for NPMClient
 */
interface NPMClientOptions {
  /** Cache TTL in milliseconds (default: 5 minutes) */
  cacheTTL?: number;
}

/**
 * Error thrown when an NPM package is not found
 */
export class PackageNotFoundError extends Error {
  public constructor(packageName: string) {
    super(`Package "${packageName}" not found on NPM registry`);
    this.name = 'PackageNotFoundError';
  }
}

/**
 * Error thrown when the NPM registry API returns an unexpected response
 */
export class NPMRegistryError extends Error {
  public constructor(
    message: string,
    public statusCode?: number,
  ) {
    super(message);
    this.name = 'NPMRegistryError';
  }
}

/**
 * Client for interacting with the NPM Registry API
 */
export class NPMClient {
  private readonly baseUrl = 'https://registry.npmjs.org';
  private readonly searchUrl = 'https://registry.npmjs.org/-/v1/search';
  private readonly packageCache: SimpleCache<PackageInfo>;
  private readonly searchCache: SimpleCache<SearchResults>;

  public constructor(options: NPMClientOptions = {}) {
    const ttl = options.cacheTTL || 5 * 60 * 1000; // Default 5 minutes
    this.packageCache = new SimpleCache<PackageInfo>(ttl);
    this.searchCache = new SimpleCache<SearchResults>(ttl);
  }

  /**
   * Lookup a package by name
   * @param packageName - Name of the package to lookup
   * @returns Package information
   * @throws {PackageNotFoundError} When package is not found
   * @throws {NPMRegistryError} When registry returns an error
   */
  public async getPackage(packageName: string): Promise<PackageInfo> {
    // Check cache first
    const cacheKey = `package:${packageName}`;
    const cached = this.packageCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const url = `${this.baseUrl}/${encodeURIComponent(packageName)}`;

    try {
      const response = await fetch(url);

      if (response.status === 404) {
        throw new PackageNotFoundError(packageName);
      }

      if (!response.ok) {
        throw new NPMRegistryError(
          `NPM registry returned ${response.status}: ${response.statusText}`,
          response.status,
        );
      }

      const data: NPMPackageResponse = await response.json();
      const packageInfo = transformPackageResponse(data);

      // Cache the result
      this.packageCache.set(cacheKey, packageInfo);

      return packageInfo;
    } catch (error) {
      if (
        error instanceof PackageNotFoundError ||
        error instanceof NPMRegistryError
      ) {
        throw error;
      }

      // Network or other errors
      throw new NPMRegistryError(
        `Failed to fetch package "${packageName}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Search for packages by query
   * @param query - Search query
   * @param limit - Maximum number of results to return (default: 20, max: 50)
   * @returns Search results
   * @throws {NPMRegistryError} When registry returns an error
   */
  public async searchPackages(
    query: string,
    limit: number = 20,
  ): Promise<SearchResults> {
    const clampedLimit = Math.min(Math.max(1, limit), MAX_SEARCH_RESULTS);

    // Check cache first
    const cacheKey = `search:${query}:${clampedLimit}`;
    const cached = this.searchCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const url = new URL(this.searchUrl);
    url.searchParams.set('text', query);
    url.searchParams.set('size', clampedLimit.toString());

    try {
      const response = await fetch(url.toString());

      if (!response.ok) {
        throw new NPMRegistryError(
          `NPM registry search returned ${response.status}: ${response.statusText}`,
          response.status,
        );
      }

      const data: NPMSearchResponse = await response.json();
      const searchResults = transformSearchResponse(data);

      // Cache the result
      this.searchCache.set(cacheKey, searchResults);

      return searchResults;
    } catch (error) {
      if (error instanceof NPMRegistryError) {
        throw error;
      }

      // Network or other errors
      throw new NPMRegistryError(
        `Failed to search packages with query "${query}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
