import { SimpleCache } from './cache.js';
import type {
  PackageInfo,
  SearchResults,
  SearchResultItem,
  NPMPackageResponse,
  NPMSearchResponse,
  NPMVersionInfo,
} from './types.js';
import { MAX_SEARCH_RESULTS } from './types.js';

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
  constructor(packageName: string) {
    super(`Package "${packageName}" not found on NPM registry`);
    this.name = 'PackageNotFoundError';
  }
}

/**
 * Error thrown when the NPM registry API returns an unexpected response
 */
export class NPMRegistryError extends Error {
  constructor(
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

  constructor(options: NPMClientOptions = {}) {
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
  async getPackage(packageName: string): Promise<PackageInfo> {
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
      const packageInfo = this.transformPackageResponse(data);

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
  async searchPackages(
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
      const searchResults = this.transformSearchResponse(data);

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

  /**
   * Transform raw NPM package response to our PackageInfo format
   */
  private transformPackageResponse(data: NPMPackageResponse): PackageInfo {
    const latestVersion = data['dist-tags'].latest;
    const versionInfo: NPMVersionInfo = data.versions[latestVersion];
    const publishedAt =
      data.time[latestVersion] || data.time.created || new Date().toISOString();

    // Normalize author
    let author: string | undefined;
    if (typeof data.author === 'string') {
      author = data.author;
    } else if (
      data.author &&
      typeof data.author === 'object' &&
      data.author.name
    ) {
      author = data.author.name;
    }

    // Normalize license
    let license: string | undefined;
    if (typeof data.license === 'string') {
      license = data.license;
    } else if (
      data.license &&
      typeof data.license === 'object' &&
      data.license.type
    ) {
      license = data.license.type;
    }

    // Truncate README and description
    const readme = data.readme
      ? this.truncateText(data.readme, 5000)
      : undefined;
    const description = this.truncateText(
      data.description || versionInfo?.description || '',
      500,
    );

    return {
      name: data.name,
      version: latestVersion,
      description,
      readme,
      author,
      license,
      homepage: data.homepage || versionInfo?.repository?.url,
      repository: data.repository || versionInfo?.repository,
      keywords: data.keywords || versionInfo?.keywords,
      dependencies: versionInfo?.dependencies,
      devDependencies: versionInfo?.devDependencies,
      publishedAt,
    };
  }

  /**
   * Transform raw NPM search response to our SearchResults format
   */
  private transformSearchResponse(data: NPMSearchResponse): SearchResults {
    const results: SearchResultItem[] = data.objects.map((obj) => ({
      name: obj.package.name,
      version: obj.package.version,
      description: this.truncateText(obj.package.description || '', 500),
      author: obj.package.author?.name,
      keywords: obj.package.keywords,
      date: obj.package.date,
      score: obj.score.final,
    }));

    return {
      results,
      total: data.total,
    };
  }

  /**
   * Truncate text to a maximum length with ellipsis
   */
  private truncateText(text: string, maxLength: number): string {
    if (!text || text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }
}
