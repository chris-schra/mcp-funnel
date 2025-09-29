/**
 * Data transformation functions for NPM API responses
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
 * Normalize author field from NPM package data
 */
function normalizeAuthor(
  author: string | { name?: string } | undefined,
): string | undefined {
  if (typeof author === 'string') {
    return author;
  }
  if (author && typeof author === 'object' && author.name) {
    return author.name;
  }
  return undefined;
}

/**
 * Normalize license field from NPM package data
 */
function normalizeLicense(
  license: string | { type?: string } | undefined,
): string | undefined {
  if (typeof license === 'string') {
    return license;
  }
  if (license && typeof license === 'object' && license.type) {
    return license.type;
  }
  return undefined;
}

/**
 * Transform raw NPM package response to our PackageInfo format
 */
export function transformPackageResponse(
  data: NPMPackageResponse,
): PackageInfo {
  const latestVersion = data['dist-tags'].latest;
  const versionInfo: NPMVersionInfo = data.versions[latestVersion];
  const publishedAt =
    data.time[latestVersion] || data.time.created || new Date().toISOString();

  const author = normalizeAuthor(data.author);
  const license = normalizeLicense(data.license);

  // Truncate README and description
  const readme = data.readme ? truncateText(data.readme, 5000) : undefined;
  const description = truncateText(
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
export function transformSearchResponse(
  data: NPMSearchResponse,
): SearchResults {
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
