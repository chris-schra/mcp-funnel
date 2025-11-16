import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockFetch } from './test-utils.js';
import { NPMClient, NPMRegistryError } from '../../npm-client.js';
import type { NPMSearchResponse } from '../../types.js';

describe('NPMClient', () => {
  let client: NPMClient;

  beforeEach(() => {
    client = new NPMClient();
    mockFetch.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('searchPackages', () => {
    const mockSearchResponse: NPMSearchResponse = {
      objects: [
        {
          package: {
            name: 'react',
            version: '18.2.0',
            description: 'React is a JavaScript library for building user interfaces.',
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
            description: 'React is a JavaScript library for building user interfaces.',
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
        new NPMRegistryError('NPM registry search returned 500: Internal Server Error', 500),
      );
    });

    it('should throw NPMRegistryError for network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(client.searchPackages('react')).rejects.toThrow(
        new NPMRegistryError('Failed to search packages with query "react": Network error'),
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
});
