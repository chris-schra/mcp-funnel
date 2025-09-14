import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  NPMClient,
  PackageNotFoundError,
  NPMRegistryError,
} from './npm-client.js';
import type { NPMPackageResponse, NPMSearchResponse } from './types.js';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('NPMClient', () => {
  let client: NPMClient;

  const mockPackageResponse: NPMPackageResponse = {
    _id: 'react',
    _rev: '123-abc',
    name: 'react',
    'dist-tags': {
      latest: '18.2.0',
    },
    versions: {
      '18.2.0': {
        name: 'react',
        version: '18.2.0',
        description:
          'React is a JavaScript library for building user interfaces.',
        main: 'index.js',
        dependencies: {
          'loose-envify': '^1.1.0',
        },
        devDependencies: {
          typescript: '^4.0.0',
        },
        _id: 'react@18.2.0',
        _nodeVersion: '16.14.0',
        _npmVersion: '8.5.0',
        dist: {
          integrity: 'sha512-xxx',
          shasum: 'abc123',
          tarball: 'https://registry.npmjs.org/react/-/react-18.2.0.tgz',
          fileCount: 10,
          unpackedSize: 1024,
        },
        _npmUser: {
          name: 'testuser',
          email: 'test@example.com',
        },
        maintainers: [
          {
            name: 'testuser',
            email: 'test@example.com',
          },
        ],
        _hasShrinkwrap: false,
      },
    },
    time: {
      created: '2011-05-27T00:00:00.000Z',
      modified: '2023-01-01T00:00:00.000Z',
      '18.2.0': '2022-06-14T20:00:00.000Z',
    },
    maintainers: [
      {
        name: 'testuser',
        email: 'test@example.com',
      },
    ],
    description: 'React is a JavaScript library for building user interfaces.',
    homepage: 'https://reactjs.org',
    keywords: ['react', 'javascript', 'ui'],
    repository: {
      type: 'git',
      url: 'git+https://github.com/facebook/react.git',
    },
    author: 'Meta Platforms, Inc. and affiliates.',
    license: 'MIT',
    readme:
      'This is a very long README content that should be truncated if it exceeds the limit...',
    readmeFilename: 'README.md',
  };

  beforeEach(() => {
    client = new NPMClient();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getPackage', () => {
    it('should successfully fetch and transform package data', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPackageResponse,
      });

      const result = await client.getPackage('react');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/react',
      );
      expect(result).toEqual({
        name: 'react',
        version: '18.2.0',
        description:
          'React is a JavaScript library for building user interfaces.',
        readme:
          'This is a very long README content that should be truncated if it exceeds the limit...',
        author: 'Meta Platforms, Inc. and affiliates.',
        license: 'MIT',
        homepage: 'https://reactjs.org',
        repository: {
          type: 'git',
          url: 'git+https://github.com/facebook/react.git',
        },
        keywords: ['react', 'javascript', 'ui'],
        dependencies: {
          'loose-envify': '^1.1.0',
        },
        devDependencies: {
          typescript: '^4.0.0',
        },
        publishedAt: '2022-06-14T20:00:00.000Z',
      });
    });

    it('should throw PackageNotFoundError for 404 responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });

      await expect(client.getPackage('nonexistent-package')).rejects.toThrow(
        new PackageNotFoundError('nonexistent-package'),
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/nonexistent-package',
      );
    });

    it('should throw NPMRegistryError for non-404 HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.getPackage('react')).rejects.toThrow(
        new NPMRegistryError(
          'NPM registry returned 500: Internal Server Error',
          500,
        ),
      );
    });

    it('should throw NPMRegistryError for network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.getPackage('react')).rejects.toThrow(
        new NPMRegistryError('Failed to fetch package "react": Network error'),
      );
    });

    it('should handle scoped packages by encoding them properly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          ...mockPackageResponse,
          name: '@types/react',
        }),
      });

      await client.getPackage('@types/react');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/%40types%2Freact',
      );
    });

    it('should truncate README content to 5000 characters', async () => {
      const longReadme = 'a'.repeat(6000);
      const mockResponseWithLongReadme = {
        ...mockPackageResponse,
        readme: longReadme,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponseWithLongReadme,
      });

      const result = await client.getPackage('react');

      expect(result.readme).toHaveLength(5000);
      expect(result.readme).toMatch(/\.\.\.$/);
    });

    it('should truncate description to 500 characters', async () => {
      const longDescription = 'b'.repeat(600);
      const mockResponseWithLongDesc = {
        ...mockPackageResponse,
        description: longDescription,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponseWithLongDesc,
      });

      const result = await client.getPackage('react');

      expect(result.description).toHaveLength(500);
      expect(result.description).toMatch(/\.\.\.$/);
    });

    it('should cache successful responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPackageResponse,
      });

      // First call
      await client.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await client.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle author as object', async () => {
      const mockResponseWithAuthorObject = {
        ...mockPackageResponse,
        author: {
          name: 'John Doe',
          email: 'john@example.com',
          url: 'https://johndoe.com',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponseWithAuthorObject,
      });

      const result = await client.getPackage('react');

      expect(result.author).toBe('John Doe');
    });

    it('should handle license as object', async () => {
      const mockResponseWithLicenseObject = {
        ...mockPackageResponse,
        license: {
          type: 'MIT',
          url: 'https://opensource.org/licenses/MIT',
        },
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponseWithLicenseObject,
      });

      const result = await client.getPackage('react');

      expect(result.license).toBe('MIT');
    });
  });

  describe('searchPackages', () => {
    const mockSearchResponse: NPMSearchResponse = {
      objects: [
        {
          package: {
            name: 'react',
            version: '18.2.0',
            description:
              'React is a JavaScript library for building user interfaces.',
            keywords: ['react', 'javascript'],
            date: '2022-06-14T20:00:00.000Z',
            links: {
              npm: 'https://www.npmjs.com/package/react',
              homepage: 'https://reactjs.org',
              repository: 'https://github.com/facebook/react',
            },
            author: {
              name: 'Meta Platforms, Inc.',
              email: 'react@meta.com',
              username: 'react',
            },
            publisher: {
              username: 'react',
              email: 'react@meta.com',
            },
            maintainers: [
              {
                username: 'react',
                email: 'react@meta.com',
              },
            ],
          },
          score: {
            final: 0.95,
            detail: {
              quality: 0.98,
              popularity: 0.92,
              maintenance: 0.95,
            },
          },
          searchScore: 100000.12,
        },
        {
          package: {
            name: 'react-dom',
            version: '18.2.0',
            description: 'React package for working with the DOM.',
            keywords: ['react', 'dom'],
            date: '2022-06-14T20:00:00.000Z',
            links: {
              npm: 'https://www.npmjs.com/package/react-dom',
            },
            publisher: {
              username: 'react',
              email: 'react@meta.com',
            },
            maintainers: [
              {
                username: 'react',
                email: 'react@meta.com',
              },
            ],
          },
          score: {
            final: 0.93,
            detail: {
              quality: 0.96,
              popularity: 0.9,
              maintenance: 0.93,
            },
          },
          searchScore: 95000.45,
        },
      ],
      total: 2,
      time: 'Wed Jan 01 2025 00:00:00 GMT+0000 (UTC)',
    };

    it('should successfully search and transform results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSearchResponse,
      });

      const result = await client.searchPackages('react', 20);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/-/v1/search?text=react&size=20',
      );
      expect(result).toEqual({
        results: [
          {
            name: 'react',
            version: '18.2.0',
            description:
              'React is a JavaScript library for building user interfaces.',
            author: 'Meta Platforms, Inc.',
            keywords: ['react', 'javascript'],
            date: '2022-06-14T20:00:00.000Z',
            score: 0.95,
          },
          {
            name: 'react-dom',
            version: '18.2.0',
            description: 'React package for working with the DOM.',
            author: undefined,
            keywords: ['react', 'dom'],
            date: '2022-06-14T20:00:00.000Z',
            score: 0.93,
          },
        ],
        total: 2,
      });
    });

    it('should use default limit of 20 when not specified', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSearchResponse,
      });

      await client.searchPackages('react');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/-/v1/search?text=react&size=20',
      );
    });

    it('should clamp limit to maximum of 50', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSearchResponse,
      });

      await client.searchPackages('react', 300);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/-/v1/search?text=react&size=50',
      );
    });

    it('should clamp limit to minimum of 1', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSearchResponse,
      });

      await client.searchPackages('react', 0);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://registry.npmjs.org/-/v1/search?text=react&size=1',
      );
    });

    it('should throw NPMRegistryError for HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.searchPackages('react')).rejects.toThrow(
        new NPMRegistryError(
          'NPM registry search returned 500: Internal Server Error',
          500,
        ),
      );
    });

    it('should throw NPMRegistryError for network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.searchPackages('react')).rejects.toThrow(
        new NPMRegistryError(
          'Failed to search packages with query "react": Network error',
        ),
      );
    });

    it('should cache search results', async () => {
      // Mock the first call (react with limit 20)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSearchResponse,
      });

      // Mock the second call (react with limit 10 - different cache key)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSearchResponse,
      });

      // First call
      await client.searchPackages('react', 20);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call with same parameters should use cache
      await client.searchPackages('react', 20);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Different limit should make a new call
      await client.searchPackages('react', 10);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should truncate descriptions in search results', async () => {
      const longDescription = 'c'.repeat(600);
      const mockResponseWithLongDesc = {
        ...mockSearchResponse,
        objects: [
          {
            ...mockSearchResponse.objects[0],
            package: {
              ...mockSearchResponse.objects[0].package,
              description: longDescription,
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponseWithLongDesc,
      });

      const result = await client.searchPackages('react');

      expect(result.results[0].description).toHaveLength(500);
      expect(result.results[0].description).toMatch(/\.\.\.$/);
    });
  });

  describe('cache behavior', () => {
    it('should cache package results separately from search results', async () => {
      const mockPackageResponse: NPMPackageResponse = {
        _id: 'test-package',
        _rev: '1-abc',
        name: 'test-package',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name: 'test-package',
            version: '1.0.0',
            _id: 'test-package@1.0.0',
            _nodeVersion: '16.0.0',
            _npmVersion: '8.0.0',
            dist: {
              integrity: 'sha512-test',
              shasum: 'test',
              tarball:
                'https://registry.npmjs.org/test-package/-/test-package-1.0.0.tgz',
              fileCount: 1,
              unpackedSize: 100,
            },
            _npmUser: { name: 'test', email: 'test@test.com' },
            maintainers: [{ name: 'test', email: 'test@test.com' }],
            _hasShrinkwrap: false,
          },
        },
        time: {
          created: '2023-01-01T00:00:00.000Z',
          '1.0.0': '2023-01-01T00:00:00.000Z',
        },
        maintainers: [{ name: 'test', email: 'test@test.com' }],
      };

      const mockSearchResponse: NPMSearchResponse = {
        objects: [],
        total: 0,
        time: 'Wed Jan 01 2025 00:00:00 GMT+0000 (UTC)',
      };

      // Mock package call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPackageResponse,
      });

      // Mock search call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSearchResponse,
      });

      await client.getPackage('test-package');
      await client.searchPackages('test-package');

      // Both should have been called
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Second calls should use cache
      await client.getPackage('test-package');
      await client.searchPackages('test-package');

      // Still only 2 calls total
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache TTL configuration', () => {
    it('should use default 5-minute TTL when no options provided', async () => {
      const defaultClient = new NPMClient();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPackageResponse,
      });

      await defaultClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache (within 5 minutes)
      await defaultClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should use custom TTL when provided in options', async () => {
      const customTTL = 10 * 60 * 1000; // 10 minutes
      const customClient = new NPMClient({ cacheTTL: customTTL });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPackageResponse,
      });

      await customClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      await customClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should apply custom TTL to both package and search caches', async () => {
      const customTTL = 1000; // 1 second for testing
      const customClient = new NPMClient({ cacheTTL: customTTL });

      // Test package cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPackageResponse,
      });

      await customClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Test search cache
      const mockSearchResponse: NPMSearchResponse = {
        objects: [],
        total: 0,
        time: 'Wed Jan 01 2025 00:00:00 GMT+0000 (UTC)',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSearchResponse,
      });

      await customClient.searchPackages('react');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Both should use cache for immediate calls
      await customClient.getPackage('react');
      await customClient.searchPackages('react');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Mock new responses for expired cache
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPackageResponse,
      });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockSearchResponse,
      });

      // After expiration, should make new calls
      await customClient.getPackage('react');
      await customClient.searchPackages('react');
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });

    it('should handle very short TTL as near-immediate cache expiration', async () => {
      const shortTTLClient = new NPMClient({ cacheTTL: 1 }); // 1ms TTL

      // Mock different responses to verify each call is made
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockPackageResponse,
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => mockPackageResponse,
        });

      // With 1ms TTL, cache should expire very quickly
      await shortTTLClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, 5));

      await shortTTLClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should handle very large TTL values', async () => {
      const largeTTL = 24 * 60 * 60 * 1000; // 24 hours
      const largeClient = new NPMClient({ cacheTTL: largeTTL });

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockPackageResponse,
      });

      await largeClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Should still use cache for subsequent calls
      await largeClient.getPackage('react');
      await largeClient.getPackage('react');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });
});
