/**
 * Data transformation utilities for NPM Registry API responses.
 *
 * Transforms raw NPM Registry API responses into normalized application types,
 * handling various inconsistent formats and applying data sanitization like
 * text truncation for large fields.
 * @internal
 */
import type {
  PackageInfo,
  SearchResults,
  SearchResultItem,
  NPMPackageResponse,
  NPMSearchResponse,
  NPMVersionInfo,
} from '../types.js';
import { truncateText } from './text.js';

/**
 * Normalizes author field from various NPM package data formats.
 *
 * NPM API can return author as string, object with name property, or undefined.
 * This function extracts the author name string consistently.
 * @param author - Author data from NPM API in any supported format
 * @returns Author name string or undefined if not present
 * @internal
 */
function normalizeAuthor(author: string | { name?: string } | undefined): string | undefined {
  if (typeof author === 'string') {
    return author;
  }
  if (author && typeof author === 'object' && author.name) {
    return author.name;
  }
  return undefined;
}

/**
 * Normalizes license field from various NPM package data formats.
 *
 * NPM API can return license as string, object with type property, or undefined.
 * This function extracts the license type string consistently.
 * @param license - License data from NPM API in any supported format
 * @returns License type string or undefined if not present
 * @internal
 */
function normalizeLicense(license: string | { type?: string } | undefined): string | undefined {
  if (typeof license === 'string') {
    return license;
  }
  if (license && typeof license === 'object' && license.type) {
    return license.type;
  }
  return undefined;
}

/**
 * Transforms raw NPM Registry package response to normalized PackageInfo format.
 *
 * Extracts and normalizes data from the NPM Registry's package endpoint response,
 * including handling various format inconsistencies, resolving the latest version,
 * and applying text truncation to prevent excessively large responses.
 *
 * Key transformations:
 * - Resolves latest version from dist-tags
 * - Normalizes author and license fields (string or object)
 * - Truncates README to 5000 chars and description to 500 chars
 * - Falls back to version-specific data when package-level data missing
 * @param data - Raw NPM Registry package response
 * @returns Normalized package information
 * @example
 * ```typescript
 * const raw = await fetch('https://registry.npmjs.org/react');
 * const packageInfo = transformPackageResponse(raw);
 * // \{ name: 'react', version: '18.2.0', description: '...', ... \}
 * ```
 * @public
 * @see file:../../npm-client.ts:92 - Used after fetching package data
 */
export function transformPackageResponse(data: NPMPackageResponse): PackageInfo {
  const latestVersion = data['dist-tags'].latest;
  const versionInfo: NPMVersionInfo = data.versions[latestVersion];
  const publishedAt = data.time[latestVersion] || data.time.created || new Date().toISOString();

  const author = normalizeAuthor(data.author);
  const license = normalizeLicense(data.license);

  // Truncate README and description
  const readme = data.readme ? truncateText(data.readme, 5000) : undefined;
  const description = truncateText(data.description || versionInfo?.description || '', 500);

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
 * Transforms raw NPM Registry search response to normalized SearchResults format.
 *
 * Maps the NPM Registry search endpoint response into a simplified format,
 * extracting key fields and applying description truncation to keep response
 * size manageable.
 * @param data - Raw NPM Registry search response
 * @returns Normalized search results with total count
 * @example
 * ```typescript
 * const raw = await fetch('https://registry.npmjs.org/-/v1/search?text=react');
 * const results = transformSearchResponse(raw);
 * // \{ results: [...], total: 15234 \}
 * ```
 * @public
 * @see file:../../npm-client.ts:148 - Used after searching packages
 */
export function transformSearchResponse(data: NPMSearchResponse): SearchResults {
  const results: SearchResultItem[] = data.objects.map((obj) => ({
    name: obj.package.name,
    version: obj.package.version,
    description: truncateText(obj.package.description || '', 500),
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
