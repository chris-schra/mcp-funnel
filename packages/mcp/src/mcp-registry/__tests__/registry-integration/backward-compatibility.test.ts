/**
 * Tests for backward compatibility with legacy server formats
 */

import { describe, it, expect } from 'vitest';
import {
  generateConfigSnippet,
  RegistryContext,
  setupRegistryIntegrationTest,
  type RegistryServer,
  type Package,
  type Remote,
  type ServerDetail,
} from './test-utils.js';

describe('Registry Integration Tests', () => {
  const { mockProxyConfig, mockFetch } = setupRegistryIntegrationTest();

  describe('Backward Compatibility', () => {
    it('should handle servers without _meta field', () => {
      const serverWithoutMeta: ServerDetail = {
        id: 'legacy-server-id',
        name: 'Legacy Server',
        description: 'Server without _meta field for backward compatibility',
        packages: [
          {
            identifier: 'legacy-package',
            registry_type: 'npm',
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          servers: [serverWithoutMeta],
          metadata: { count: 1, next_cursor: null },
        }),
      });

      const context = RegistryContext.getInstance(mockProxyConfig);

      expect(async () => {
        const searchResult = await context.searchServers('legacy');
        expect(searchResult.found).toBe(true);
        expect(searchResult.servers![0].registryId).toBe('legacy-server-id'); // Falls back to id
      }).not.toThrow();
    });

    it('should handle packages without environment_variables field', () => {
      const packageWithoutEnv: Package = {
        identifier: 'simple-package',
        registry_type: 'npm',
        package_arguments: ['--simple'],
      };

      const server: RegistryServer = {
        id: 'simple-server',
        name: 'Simple Server',
        description: 'Server with package without env vars',
        packages: [packageWithoutEnv],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('npx');
      expect(config.args).toEqual(['-y', 'simple-package', '--simple']);
      expect(config.env).toBeUndefined();
    });

    it('should handle remotes without headers field', () => {
      const remoteWithoutHeaders: Remote = {
        type: 'stdio',
        url: 'http://localhost:3000/mcp',
      };

      const server: RegistryServer = {
        id: 'simple-remote',
        name: 'Simple Remote Server',
        description: 'Remote server without headers',
        remotes: [remoteWithoutHeaders],
      };

      const config = generateConfigSnippet(server);

      expect(config.transport).toBe('stdio');
      expect(config.url).toBe('http://localhost:3000/mcp');
      expect(config.headers).toBeUndefined();
    });

    it('should handle old format servers with missing registry_type', () => {
      const packageWithoutRegistryType = {
        identifier: 'unknown-package',
        // Missing registry_type field
        package_arguments: ['--legacy'],
      } as Package;

      const server: RegistryServer = {
        id: 'old-format-server',
        name: 'Old Format Server',
        description: 'Server with old package format',
        packages: [packageWithoutRegistryType],
      };

      const config = generateConfigSnippet(server);

      // Should fall back to raw metadata for unknown types
      expect(config._raw_metadata).toBeTruthy();
      expect(config.name).toBe('Old Format Server');
    });
  });
});
