/**
 * Tests for multiple package types configuration validation
 */

import { describe, it, expect } from 'vitest';
import {
  generateConfigSnippet,
  setupRegistryIntegrationTest,
  type RegistryServer,
  type Package,
  type Remote,
  type KeyValueInput,
} from './test-utils.js';

describe('Registry Integration Tests', () => {
  setupRegistryIntegrationTest();

  describe('Multiple Package Types Configuration Validation', () => {
    it('should generate correct NPM config with npx', async () => {
      const npmPackage: Package = {
        identifier: '@scope/npm-server',
        registry_type: 'npm',
        package_arguments: ['--production', '--port', '3000'],
        environment_variables: [{ name: 'NODE_ENV', value: 'production' }],
      };

      const server: RegistryServer = {
        id: 'npm-server',
        name: 'NPM Server',
        description: 'NPM package server',
        packages: [npmPackage],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('npx');
      expect(config.args).toEqual([
        '-y',
        '@scope/npm-server',
        '--production',
        '--port',
        '3000',
      ]);
      expect(config.env).toEqual({ NODE_ENV: 'production' });
    });

    it('should generate correct PyPI config with uvx', async () => {
      const pypiPackage: Package = {
        identifier: 'mcp-python-server',
        registry_type: 'pypi',
        package_arguments: ['--verbose', '--host', '0.0.0.0'],
        environment_variables: [
          { name: 'PYTHONPATH', value: '/opt/mcp' },
          { name: 'LOG_LEVEL', value: 'DEBUG' },
        ],
      };

      const server: RegistryServer = {
        id: 'pypi-server',
        name: 'PyPI Server',
        description: 'Python package server',
        packages: [pypiPackage],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('uvx');
      expect(config.args).toEqual([
        'mcp-python-server',
        '--verbose',
        '--host',
        '0.0.0.0',
      ]);
      expect(config.env).toEqual({
        PYTHONPATH: '/opt/mcp',
        LOG_LEVEL: 'DEBUG',
      });
    });

    it('should generate correct OCI config with docker', async () => {
      const ociPackage: Package = {
        identifier: 'ghcr.io/example/mcp-server:v1.0.0',
        registry_type: 'oci',
        package_arguments: ['--config', '/app/config.json'],
        environment_variables: [
          { name: 'CONTAINER_PORT', value: '8080' },
          { name: 'ENV', value: 'production' },
        ],
      };

      const server: RegistryServer = {
        id: 'oci-server',
        name: 'OCI Container Server',
        description: 'Container-based server',
        packages: [ociPackage],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('docker');
      expect(config.args).toEqual([
        'run',
        '-i',
        '--rm',
        'ghcr.io/example/mcp-server:v1.0.0',
        '--config',
        '/app/config.json',
      ]);
      expect(config.env).toEqual({
        CONTAINER_PORT: '8080',
        ENV: 'production',
      });
    });

    it('should generate correct remote config with proper headers', async () => {
      const headers: KeyValueInput[] = [
        {
          name: 'Authorization',
          value: 'Bearer token123',
          is_required: true,
          is_secret: true,
        },
        { name: 'X-API-Version', value: 'v1', is_required: false },
        { name: 'User-Agent', value: 'MCP-Client/1.0', is_required: false },
      ];

      const remote: Remote = {
        type: 'websocket',
        url: 'wss://api.example.com/mcp/ws',
        headers,
      };

      const server: RegistryServer = {
        id: 'remote-ws-server',
        name: 'Remote WebSocket Server',
        description: 'WebSocket-based remote server',
        remotes: [remote],
      };

      const config = generateConfigSnippet(server);

      expect(config.transport).toBe('websocket');
      expect(config.url).toBe('wss://api.example.com/mcp/ws');
      expect(config.headers).toEqual(headers);
    });

    it('should handle GitHub package type correctly', async () => {
      const githubPackage: Package = {
        identifier: 'owner/repo',
        registry_type: 'github',
        package_arguments: ['start', '--production'],
        environment_variables: [
          { name: 'GITHUB_TOKEN', is_required: true },
          { name: 'NODE_ENV', value: 'production' },
        ],
      };

      const server: RegistryServer = {
        id: 'github-server',
        name: 'GitHub Server',
        description: 'GitHub repository server',
        packages: [githubPackage],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('npx');
      expect(config.args).toEqual([
        '-y',
        'github:owner/repo',
        'start',
        '--production',
      ]);
      expect(config.env).toEqual({ NODE_ENV: 'production' });
    });
  });
});
