import { vi } from 'vitest';
import type { NPMPackageResponse, NPMSearchResponse } from '../../types.js';

// Mock fetch globally
export const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create mock package response
/**
 *
 * @param overrides
 */
export function createMockPackageResponse(
  overrides?: Partial<NPMPackageResponse>,
): NPMPackageResponse {
  return {
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
    ...overrides,
  };
}

// Create mock search response
/**
 *
 * @param overrides
 */
export function createMockSearchResponse(
  overrides?: Partial<NPMSearchResponse>,
): NPMSearchResponse {
  return {
    objects: [
      {
        package: {
          name: 'react',
          scope: 'unscoped',
          version: '18.2.0',
          description:
            'React is a JavaScript library for building user interfaces.',
          keywords: ['react', 'javascript', 'ui'],
          date: '2022-06-14T20:00:00.000Z',
          links: {
            npm: 'https://www.npmjs.com/package/react',
            homepage: 'https://reactjs.org',
            repository: 'https://github.com/facebook/react',
            bugs: 'https://github.com/facebook/react/issues',
          },
          author: {
            name: 'Meta Platforms, Inc. and affiliates.',
          },
          publisher: {
            username: 'testuser',
            email: 'test@example.com',
          },
          maintainers: [
            {
              username: 'testuser',
              email: 'test@example.com',
            },
          ],
        },
        score: {
          final: 0.95,
          detail: {
            quality: 0.9,
            popularity: 0.95,
            maintenance: 0.92,
          },
        },
        searchScore: 100000,
      },
    ],
    total: 1,
    time: 'Wed Jan 01 2023 12:00:00 GMT+0000 (UTC)',
    ...overrides,
  };
}
