/**
 * Maximum number of search results that can be requested
 */
export const MAX_SEARCH_RESULTS = 50;

/**
 * NPM package information as returned by our client
 */
export interface PackageInfo {
  name: string;
  version: string;
  description: string;
  readme?: string;
  author?: string;
  license?: string;
  homepage?: string;
  repository?: {
    type: string;
    url: string;
  };
  keywords?: string[];
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  publishedAt: string;
  downloads?: number;
}

/**
 * NPM search result item
 */
export interface SearchResultItem {
  name: string;
  version: string;
  description: string;
  author?: string;
  keywords?: string[];
  date: string;
  score: number;
}

/**
 * NPM search results
 */
export interface SearchResults {
  results: SearchResultItem[];
  total: number;
}

/**
 * Raw NPM Registry API package response
 */
export interface NPMPackageResponse {
  _id: string;
  _rev: string;
  name: string;
  'dist-tags': {
    latest: string;
    [tag: string]: string;
  };
  versions: Record<string, NPMVersionInfo>;
  time: Record<string, string>;
  maintainers: Array<{
    name: string;
    email: string;
  }>;
  description?: string;
  homepage?: string;
  keywords?: string[];
  repository?: {
    type: string;
    url: string;
  };
  author?:
    | string
    | {
        name: string;
        email?: string;
        url?: string;
      };
  license?:
    | string
    | {
        type: string;
        url?: string;
      };
  readme?: string;
  readmeFilename?: string;
}

/**
 * NPM version information
 */
export interface NPMVersionInfo {
  name: string;
  version: string;
  description?: string;
  main?: string;
  scripts?: Record<string, string>;
  repository?: {
    type: string;
    url: string;
  };
  keywords?: string[];
  author?:
    | string
    | {
        name: string;
        email?: string;
        url?: string;
      };
  license?:
    | string
    | {
        type: string;
        url?: string;
      };
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  _id: string;
  _nodeVersion: string;
  _npmVersion: string;
  dist: {
    integrity: string;
    shasum: string;
    tarball: string;
    fileCount: number;
    unpackedSize: number;
  };
  _npmUser: {
    name: string;
    email: string;
  };
  directories?: Record<string, unknown>;
  maintainers: Array<{
    name: string;
    email: string;
  }>;
  _npmOperationalInternal?: {
    host: string;
    tmp: string;
  };
  _hasShrinkwrap: boolean;
}

/**
 * Raw NPM Registry API search response
 */
export interface NPMSearchResponse {
  objects: Array<{
    package: {
      name: string;
      scope?: string;
      version: string;
      description?: string;
      keywords?: string[];
      date: string;
      links: {
        npm: string;
        homepage?: string;
        repository?: string;
        bugs?: string;
      };
      author?: {
        name: string;
        email?: string;
        username?: string;
      };
      publisher: {
        username: string;
        email: string;
      };
      maintainers: Array<{
        username: string;
        email: string;
      }>;
    };
    score: {
      final: number;
      detail: {
        quality: number;
        popularity: number;
        maintenance: number;
      };
    };
    searchScore: number;
  }>;
  total: number;
  time: string;
}
