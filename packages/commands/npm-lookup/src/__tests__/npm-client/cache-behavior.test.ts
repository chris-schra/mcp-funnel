import { describe, it, expect, beforeEach } from 'vitest';
import { mockFetch } from './test-utils.js';
import { NPMClient } from '../../npm-client.js';
import type { NPMPackageResponse, NPMSearchResponse } from '../../types.js';

describe('cache behavior', () => {
  let client: NPMClient;

  beforeEach(() => {
    client = new NPMClient();
    mockFetch.mockClear();
  });

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
