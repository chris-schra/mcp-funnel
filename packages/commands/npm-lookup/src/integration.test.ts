import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { NPMClient, PackageNotFoundError } from './npm-client.js';
import { NPMCommand } from './command.js';

// Skip integration tests unless explicitly enabled
// These tests make actual network requests to the NPM Registry
// Run with: RUN_INTEGRATION_TESTS=true yarn test
const runIntegrationTests = process.env.RUN_INTEGRATION_TESTS === 'true';

/**
 * Integration Tests for NPM Registry API
 *
 * These tests validate that our implementation works correctly with the real NPM Registry.
 * They are disabled by default to avoid network dependencies during normal development.
 *
 * To run integration tests:
 *   RUN_INTEGRATION_TESTS=true yarn test packages/commands/npm-lookup
 *
 * Requirements:
 * - Active internet connection
 * - Access to https://registry.npmjs.org
 *
 * Test timeouts are set to 10 seconds to handle network latency.
 */

describe.skipIf(!runIntegrationTests)('NPM Registry Integration Tests', () => {
  beforeAll(async () => {
    // Basic connectivity check to NPM registry
    try {
      const response = await fetch('https://registry.npmjs.org');
      if (!response.ok) {
        throw new Error(`NPM Registry not accessible: ${response.status}`);
      }
    } catch (error) {
      throw new Error(
        `Cannot reach NPM Registry. Check network connection: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  });

  describe('NPMClient Integration', () => {
    let client: NPMClient;

    beforeEach(() => {
      // Create a fresh client for each test to avoid cache interference
      client = new NPMClient();
    });

    describe('getPackage() with real API', () => {
      it('should fetch real package information for lodash', async () => {
        const result = await client.getPackage('lodash');

        // Verify required fields are present and have expected structure
        expect(result.name).toBe('lodash');
        expect(result.version).toBeTruthy();
        expect(typeof result.version).toBe('string');
        expect(result.description).toBeTruthy();
        expect(typeof result.description).toBe('string');
        expect(result.publishedAt).toBeTruthy();
        expect(new Date(result.publishedAt).getTime()).toBeGreaterThan(0);

        // Verify optional fields have correct types when present
        if (result.author) {
          expect(typeof result.author).toBe('string');
        }
        if (result.license) {
          expect(typeof result.license).toBe('string');
        }
        if (result.homepage) {
          expect(typeof result.homepage).toBe('string');
          expect(result.homepage).toMatch(/^https?:\/\//);
        }
        if (result.keywords) {
          expect(Array.isArray(result.keywords)).toBe(true);
        }
        if (result.dependencies) {
          expect(typeof result.dependencies).toBe('object');
        }
        if (result.devDependencies) {
          expect(typeof result.devDependencies).toBe('object');
        }
      }, 10000);

      it('should fetch real package information for scoped package', async () => {
        const result = await client.getPackage('@types/node');

        expect(result.name).toBe('@types/node');
        expect(result.version).toBeTruthy();
        expect(result.description).toBeTruthy();
        expect(result.publishedAt).toBeTruthy();

        // Verify the scoped package has expected characteristics
        expect(result.name).toMatch(/^@.+\/.+/);
      }, 10000);

      it('should handle non-existent packages gracefully', async () => {
        const nonExistentPackage = `test-package-that-definitely-does-not-exist-${Date.now()}`;

        await expect(client.getPackage(nonExistentPackage)).rejects.toThrow(
          PackageNotFoundError,
        );

        await expect(client.getPackage(nonExistentPackage)).rejects.toThrow(
          `Package "${nonExistentPackage}" not found on NPM registry`,
        );
      }, 10000);

      it('should properly cache real API responses', async () => {
        const packageName = 'express';

        // Make first request
        const start1 = Date.now();
        const result1 = await client.getPackage(packageName);
        const time1 = Date.now() - start1;

        // Make second request (should be cached and much faster)
        const start2 = Date.now();
        const result2 = await client.getPackage(packageName);
        const time2 = Date.now() - start2;

        // Verify results are identical
        expect(result1).toEqual(result2);

        // Second request should be significantly faster (cached)
        // Allow some margin for execution overhead
        expect(time2).toBeLessThan(Math.max(time1 / 10, 50));
      }, 15000);

      it('should handle packages with complex metadata', async () => {
        // React is a good test case for complex package metadata
        const result = await client.getPackage('react');

        expect(result.name).toBe('react');
        expect(result.version).toBeTruthy();
        expect(result.description).toContain('JavaScript library');

        // React should have these typical characteristics
        expect(result.keywords).toBeTruthy();
        expect(Array.isArray(result.keywords)).toBe(true);
        expect(result.repository).toBeTruthy();
        expect(result.homepage).toBeTruthy();
        expect(result.license).toBe('MIT');

        // Verify repository structure
        if (result.repository && typeof result.repository === 'object') {
          expect(result.repository.type).toBe('git');
          expect(result.repository.url).toBeTruthy();
        }
      }, 10000);
    });

    describe('searchPackages() with real API', () => {
      it('should search for real packages with common term', async () => {
        const results = await client.searchPackages('typescript', 5);

        expect(results.results).toBeDefined();
        expect(Array.isArray(results.results)).toBe(true);
        expect(results.results.length).toBeGreaterThan(0);
        expect(results.results.length).toBeLessThanOrEqual(5);
        expect(results.total).toBeGreaterThan(0);

        // Verify first result structure
        const firstResult = results.results[0];
        expect(firstResult.name).toBeTruthy();
        expect(firstResult.version).toBeTruthy();
        expect(firstResult.date).toBeTruthy();
        expect(typeof firstResult.score).toBe('number');
        expect(firstResult.score).toBeGreaterThan(0);
        expect(firstResult.score).toBeLessThanOrEqual(1);

        // At least one result should contain 'typescript' in name or description
        const hasTypescriptMatch = results.results.some(
          (pkg) =>
            pkg.name.toLowerCase().includes('typescript') ||
            (pkg.description &&
              pkg.description.toLowerCase().includes('typescript')),
        );
        expect(hasTypescriptMatch).toBe(true);
      }, 10000);

      it('should respect limit parameter in search', async () => {
        const smallLimit = 3;
        const results = await client.searchPackages('react', smallLimit);

        expect(results.results.length).toBeLessThanOrEqual(smallLimit);
        expect(results.total).toBeGreaterThan(smallLimit); // Should have more total results
      }, 10000);

      it('should handle search terms with no results', async () => {
        // Use a very specific search that's unlikely to have results
        const obscureSearch = `very-specific-search-term-${Date.now()}-no-results`;
        const results = await client.searchPackages(obscureSearch, 5);

        expect(results.results).toBeDefined();
        expect(Array.isArray(results.results)).toBe(true);
        expect(results.total).toBe(0);
        expect(results.results.length).toBe(0);
      }, 10000);

      it('should properly cache search results', async () => {
        const searchTerm = 'lodash';
        const limit = 10;

        // Make first search request
        const start1 = Date.now();
        const results1 = await client.searchPackages(searchTerm, limit);
        const time1 = Date.now() - start1;

        // Make second identical request (should be cached)
        const start2 = Date.now();
        const results2 = await client.searchPackages(searchTerm, limit);
        const time2 = Date.now() - start2;

        // Verify results are identical
        expect(results1).toEqual(results2);

        // Second request should be much faster (cached)
        expect(time2).toBeLessThan(Math.max(time1 / 10, 50));
      }, 15000);

      it('should handle search results with various metadata', async () => {
        const results = await client.searchPackages('express', 10);

        expect(results.results.length).toBeGreaterThan(0);

        // Check that at least some results have rich metadata
        let hasAuthor = false;
        let hasKeywords = false;
        let hasDescription = false;

        for (const pkg of results.results) {
          if (pkg.author) hasAuthor = true;
          if (pkg.keywords && pkg.keywords.length > 0) hasKeywords = true;
          if (pkg.description) hasDescription = true;
        }

        // Popular packages like Express should have rich metadata
        expect(hasDescription).toBe(true);
        // Some results should have authors and keywords
        expect(hasAuthor || hasKeywords).toBe(true);
      }, 10000);
    });
  });

  describe('NPMCommand Integration', () => {
    let command: NPMCommand;

    beforeEach(() => {
      command = new NPMCommand();
    });

    describe('end-to-end tool execution', () => {
      it('should execute lookup tool with real API', async () => {
        const result = await command.executeToolViaMCP('lookup', {
          packageName: 'lodash',
        });

        expect(result.isError).toBeUndefined();
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');

        const content = result.content[0].text;
        expect(content).toContain('"name": "lodash"');
        expect(content).toContain('"version"');
        expect(content).toContain('"description"');

        // Verify it's valid JSON
        const parsed = JSON.parse(content as string);
        expect(parsed.name).toBe('lodash');
        expect(parsed.version).toBeTruthy();
      }, 10000);

      it('should execute search tool with real API', async () => {
        const result = await command.executeToolViaMCP('search', {
          query: 'vue',
          limit: 5,
        });

        expect(result.isError).toBeUndefined();
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');

        const content = result.content[0].text;
        expect(content).toContain('"results"');
        expect(content).toContain('"total"');

        // Verify it's valid JSON with expected structure
        const parsed = JSON.parse(content as string);
        expect(Array.isArray(parsed.results)).toBe(true);
        expect(typeof parsed.total).toBe('number');
        expect(parsed.results.length).toBeLessThanOrEqual(5);

        if (parsed.results.length > 0) {
          expect(parsed.results[0].name).toBeTruthy();
        }
      }, 10000);

      it('should handle lookup errors gracefully through MCP', async () => {
        const nonExistentPackage = `integration-test-package-${Date.now()}`;
        const result = await command.executeToolViaMCP('lookup', {
          packageName: nonExistentPackage,
        });

        expect(result.isError).toBe(true);
        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('not found');
        expect(result.content[0].text).toContain(nonExistentPackage);
      }, 10000);

      it('should maintain consistency between direct client and MCP execution', async () => {
        const packageName = 'express';

        // Get result directly from client
        const directClient = new NPMClient();
        const directResult = await directClient.getPackage(packageName);

        // Get result through MCP command
        const mcpResult = await command.executeToolViaMCP('lookup', {
          packageName,
        });

        expect(mcpResult.isError).toBeUndefined();
        const parsedMcpResult = JSON.parse(mcpResult.content[0].text as string);

        // Results should be identical
        expect(parsedMcpResult).toEqual(directResult);
      }, 15000);
    });

    describe('network resilience', () => {
      it('should handle network timeouts gracefully', async () => {
        // This test verifies our error handling, but we can't easily simulate
        // timeouts in integration tests. We'll test with a valid package
        // and ensure no timeout errors occur within reasonable time
        const result = await command.executeToolViaMCP('lookup', {
          packageName: 'moment',
        });

        expect(result.isError).toBeUndefined();
        expect(result.content[0].text).toContain('"name": "moment"');
      }, 10000);
    });
  });

  describe('data consistency validation', () => {
    it('should return consistent data format across multiple packages', async () => {
      const client = new NPMClient();
      const testPackages = ['lodash', 'express', 'react'];

      const results = await Promise.all(
        testPackages.map((pkg) => client.getPackage(pkg)),
      );

      // Verify all results have consistent required fields
      for (const result of results) {
        expect(typeof result.name).toBe('string');
        expect(typeof result.version).toBe('string');
        expect(typeof result.publishedAt).toBe('string');

        // Verify date format
        expect(new Date(result.publishedAt).getTime()).toBeGreaterThan(0);

        // Verify optional fields are correct types when present
        if (result.description) {
          expect(typeof result.description).toBe('string');
          expect(result.description.length).toBeLessThanOrEqual(500);
        }
        if (result.readme) {
          expect(typeof result.readme).toBe('string');
          expect(result.readme.length).toBeLessThanOrEqual(5000);
        }
        if (result.author) {
          expect(typeof result.author).toBe('string');
        }
        if (result.license) {
          expect(typeof result.license).toBe('string');
        }
        if (result.dependencies) {
          expect(typeof result.dependencies).toBe('object');
        }
        if (result.devDependencies) {
          expect(typeof result.devDependencies).toBe('object');
        }
      }
    }, 20000);
  });
});
