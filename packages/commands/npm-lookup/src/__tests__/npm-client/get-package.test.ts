import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mockFetch, createMockPackageResponse } from './test-utils.js';
import { NPMClient, PackageNotFoundError, NPMRegistryError } from '../../npm-client.js';

describe('NPMClient', () => {
  let client: NPMClient;
  const mockPackageResponse = createMockPackageResponse();

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

      expect(mockFetch).toHaveBeenCalledWith('https://registry.npmjs.org/react');
      expect(result).toEqual({
        name: 'react',
        version: '18.2.0',
        description: 'React is a JavaScript library for building user interfaces.',
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

      expect(mockFetch).toHaveBeenCalledWith('https://registry.npmjs.org/nonexistent-package');
    });

    it('should throw NPMRegistryError for non-404 HTTP errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await expect(client.getPackage('react')).rejects.toThrow(
        new NPMRegistryError('NPM registry returned 500: Internal Server Error', 500),
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

      expect(mockFetch).toHaveBeenCalledWith('https://registry.npmjs.org/%40types%2Freact');
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
});
