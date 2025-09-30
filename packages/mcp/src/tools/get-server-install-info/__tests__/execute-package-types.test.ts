import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { CoreToolContext } from '../../core-tool.interface.js';
import type {
  RegistryServer,
  RegistryInstallInfo,
} from '../../../mcp-registry/types/registry.types.js';
import { GetServerInstallInfo } from '../index.js';
import { createMockContext, createServerSearchResponse } from './test-utils.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('GetServerInstallInfo', () => {
  let tool: GetServerInstallInfo;
  let mockContext: CoreToolContext;

  beforeEach(() => {
    tool = new GetServerInstallInfo();
    mockContext = createMockContext();

    // Reset mocks
    vi.clearAllMocks();

    // Default mock implementation
    mockFetch.mockImplementation(async (url: string) => {
      // Handle direct server fetch by ID (UUID pattern)
      if (url.includes('/v0/servers/') && !url.includes('search=')) {
        return {
          ok: false,
          status: 404,
          statusText: 'Not Found',
          json: async () => ({}),
        };
      }

      // Handle search endpoint
      if (url.includes('/v0/servers?search=')) {
        return {
          ok: true,
          status: 200,
          statusText: 'OK',
          json: async () => ({
            servers: [],
            metadata: {
              count: 0,
              next_cursor: null,
            },
          }),
        };
      }

      throw new Error(`Unmocked fetch request: ${url}`);
    });
  });

  describe('execute - package types', () => {
    it('should generate correct config for npm packages', async () => {
      const mockServer: RegistryServer = {
        id: 'npm-server',
        name: 'npm-server',
        description: 'Server from NPM package',
        packages: [
          {
            identifier: '@mcp/example-server',
            registry_type: 'npm',
            package_arguments: ['--config', 'production.json'],
            environment_variables: [{ name: 'NODE_ENV', value: 'production' }],
          },
        ],
      };

      mockFetch.mockImplementationOnce(async (url: string) => {
        if (url.includes('/v0/servers?search=npm-server')) {
          return createServerSearchResponse([mockServer]);
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const result = await tool.handle(
        { registryId: 'npm-server' },
        mockContext,
      );

      const content = result.content[0] as { type: string; text: string };
      const installInfo: RegistryInstallInfo = JSON.parse(content.text);

      expect(installInfo.configSnippet.command).toBe('npx');
      expect(installInfo.configSnippet.args).toEqual([
        '-y',
        '@mcp/example-server',
        '--config',
        'production.json',
      ]);
      expect(installInfo.configSnippet.env).toEqual({
        NODE_ENV: 'production',
      });
    });

    it('should generate correct config for pypi packages', async () => {
      const mockServer: RegistryServer = {
        id: 'pypi-server',
        name: 'pypi-server',
        description: 'Server from PyPI package',
        packages: [
          {
            identifier: 'mcp-example-server',
            registry_type: 'pypi',
            package_arguments: ['--verbose'],
            environment_variables: [{ name: 'PYTHONPATH', value: '/opt/mcp' }],
          },
        ],
      };

      mockFetch.mockImplementationOnce(async (url: string) => {
        if (url.includes('/v0/servers?search=pypi-server')) {
          return createServerSearchResponse([mockServer]);
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const result = await tool.handle(
        { registryId: 'pypi-server' },
        mockContext,
      );

      const content = result.content[0] as { type: string; text: string };
      const installInfo: RegistryInstallInfo = JSON.parse(content.text);

      expect(installInfo.configSnippet.command).toBe('uvx');
      expect(installInfo.configSnippet.args).toEqual([
        'mcp-example-server',
        '--verbose',
      ]);
      expect(installInfo.configSnippet.env).toEqual({
        PYTHONPATH: '/opt/mcp',
      });
    });

    it('should generate correct config for oci containers', async () => {
      const mockServer: RegistryServer = {
        id: 'oci-server',
        name: 'oci-server',
        description: 'Server from OCI container',
        packages: [
          {
            identifier: 'ghcr.io/example/mcp-server:latest',
            registry_type: 'oci',
            package_arguments: ['--port', '8080'],
            environment_variables: [{ name: 'PORT', value: '8080' }],
          },
        ],
      };

      mockFetch.mockImplementationOnce(async (url: string) => {
        if (url.includes('/v0/servers?search=oci-server')) {
          return createServerSearchResponse([mockServer]);
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const result = await tool.handle(
        { registryId: 'oci-server' },
        mockContext,
      );

      const content = result.content[0] as { type: string; text: string };
      const installInfo: RegistryInstallInfo = JSON.parse(content.text);

      expect(installInfo.configSnippet.command).toBe('docker');
      expect(installInfo.configSnippet.args).toEqual([
        'run',
        '-i',
        '--rm',
        'ghcr.io/example/mcp-server:latest',
        '--port',
        '8080',
      ]);
      expect(installInfo.configSnippet.env).toEqual({
        PORT: '8080',
      });
    });

    it('should generate correct config for remote servers', async () => {
      const mockServer: RegistryServer = {
        id: 'remote-server',
        name: 'remote-server',
        description: 'Server accessed remotely',
        remotes: [
          {
            type: 'sse',
            url: 'https://api.example.com/mcp',
            headers: [
              { name: 'Authorization', value: 'Bearer ${API_TOKEN}' },
              { name: 'Content-Type', value: 'application/json' },
            ],
          },
        ],
      };

      mockFetch.mockImplementationOnce(async (url: string) => {
        if (url.includes('/v0/servers?search=remote-server')) {
          return createServerSearchResponse([mockServer]);
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const result = await tool.handle(
        { registryId: 'remote-server' },
        mockContext,
      );

      const content = result.content[0] as { type: string; text: string };
      const installInfo: RegistryInstallInfo = JSON.parse(content.text);

      expect(installInfo.configSnippet.command).toBeUndefined();
      expect(installInfo.configSnippet.args).toBeUndefined();
      expect(installInfo.configSnippet.transport).toBe('sse');
      expect(installInfo.configSnippet.url).toBe('https://api.example.com/mcp');
      expect(installInfo.configSnippet.headers).toEqual({
        Authorization: 'Bearer ${API_TOKEN}',
        'Content-Type': 'application/json',
      });
    });

    it('should handle environment variables correctly', async () => {
      const mockServer: RegistryServer = {
        id: 'env-server',
        name: 'env-server',
        description: 'Server with complex environment setup',
        packages: [
          {
            identifier: 'env-test-server',
            registry_type: 'npm',
            environment_variables: [
              { name: 'REQUIRED_VAR', is_required: true },
              {
                name: 'OPTIONAL_VAR',
                value: 'default-value',
                is_required: false,
              },
              { name: 'ANOTHER_VAR', value: 'another-default' },
            ],
          },
        ],
      };

      mockFetch.mockImplementationOnce(async (url: string) => {
        if (url.includes('/v0/servers?search=env-server')) {
          return createServerSearchResponse([mockServer]);
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const result = await tool.handle(
        { registryId: 'env-server' },
        mockContext,
      );

      const content = result.content[0] as { type: string; text: string };
      const installInfo: RegistryInstallInfo = JSON.parse(content.text);

      expect(installInfo.configSnippet.env).toEqual({
        OPTIONAL_VAR: 'default-value',
        ANOTHER_VAR: 'another-default',
      });

      // Install instructions should mention required variables
      expect(installInfo.installInstructions).toContain('REQUIRED_VAR');
      expect(installInfo.installInstructions).toContain('Required');
    });

    it('should return raw metadata for unknown registry types', async () => {
      const mockServer: RegistryServer = {
        id: 'unknown-server',
        name: 'unknown-server',
        description: 'Server with unknown type',
        packages: [
          {
            identifier: 'unknown-package',
            registry_type: 'custom' as 'npm',
            package_arguments: ['--custom-arg'],
          },
        ],
      };

      mockFetch.mockImplementationOnce(async (url: string) => {
        if (url.includes('/v0/servers?search=unknown-server')) {
          return createServerSearchResponse([mockServer]);
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const result = await tool.handle(
        { registryId: 'unknown-server' },
        mockContext,
      );

      const content = result.content[0] as { type: string; text: string };
      const installInfo: RegistryInstallInfo = JSON.parse(content.text);

      // Should return a basic config for unknown registry types
      expect(installInfo.configSnippet).toEqual({
        name: 'unknown-server',
      });

      // Install instructions should contain documentation reference for unknown type
      expect(installInfo.installInstructions).toContain(
        'Check documentation for unknown-package package',
      );
    });

    it('should prefer packages over remotes when both exist', async () => {
      const mockServer: RegistryServer = {
        id: 'hybrid-server',
        name: 'hybrid-server',
        description: 'Server with both package and remote options',
        packages: [
          {
            identifier: '@hybrid/server',
            registry_type: 'npm',
          },
        ],
        remotes: [
          {
            type: 'sse',
            url: 'https://remote.example.com/mcp',
          },
        ],
      };

      mockFetch.mockImplementationOnce(async (url: string) => {
        if (url.includes('/v0/servers?search=hybrid-server')) {
          return createServerSearchResponse([mockServer]);
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const result = await tool.handle(
        { registryId: 'hybrid-server' },
        mockContext,
      );

      const content = result.content[0] as { type: string; text: string };
      const installInfo: RegistryInstallInfo = JSON.parse(content.text);

      // Should prefer package configuration
      expect(installInfo.configSnippet.command).toBe('npx');
      expect(installInfo.configSnippet.transport).toBeUndefined();
    });

    it('should handle multiple packages by using the first one', async () => {
      const mockServer: RegistryServer = {
        id: 'multi-package-server',
        name: 'multi-package-server',
        description: 'Server with multiple package options',
        packages: [
          {
            identifier: '@first/package',
            registry_type: 'npm',
          },
          {
            identifier: 'second-package',
            registry_type: 'pypi',
          },
        ],
      };

      mockFetch.mockImplementationOnce(async (url: string) => {
        if (url.includes('/v0/servers?search=multi-package-server')) {
          return createServerSearchResponse([mockServer]);
        }
        throw new Error(`Unexpected URL: ${url}`);
      });

      const result = await tool.handle(
        { registryId: 'multi-package-server' },
        mockContext,
      );

      const content = result.content[0] as { type: string; text: string };
      const installInfo: RegistryInstallInfo = JSON.parse(content.text);

      // Should use the first package
      expect(installInfo.configSnippet.command).toBe('npx');
      expect(installInfo.configSnippet.args).toEqual(['-y', '@first/package']);
    });
  });
});
