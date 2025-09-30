import { describe, it, expect } from 'vitest';
import {
  generateConfigSnippet,
  type RegistryServer,
  type Package,
  type Remote,
} from './test-utils.js';

describe('Config Generation', () => {
  describe('generateConfigSnippet - Package Types', () => {
    it('should generate npm package config', () => {
      const npmPackage: Package = {
        identifier: '@mcp/example-server',
        registry_type: 'npm',
        runtime_hint: 'node',
        package_arguments: ['--config', 'production.json'],
        environment_variables: [
          { name: 'NODE_ENV', value: 'production' },
          { name: 'API_KEY', is_required: true },
        ],
      };

      const server: RegistryServer = {
        id: 'npm-server',
        name: 'NPM Example Server',
        description: 'Example server from NPM registry',
        packages: [npmPackage],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'NPM Example Server',
        command: 'node',
        args: ['@mcp/example-server', '--config', 'production.json'],
        env: {
          NODE_ENV: 'production',
        },
      });
    });

    it('should generate npm package config without arguments', () => {
      const npmPackage: Package = {
        identifier: 'simple-mcp-server',
        registry_type: 'npm',
      };

      const server: RegistryServer = {
        id: 'simple-npm',
        name: 'Simple NPM Server',
        description: 'Simple server without extra arguments',
        packages: [npmPackage],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Simple NPM Server',
        command: 'npx',
        args: ['-y', 'simple-mcp-server'],
      });
    });

    it('should generate npm package config with yarn runtime hint', () => {
      const npmPackage: Package = {
        identifier: '@test/server',
        registry_type: 'npm',
        runtime_hint: 'yarn',
        package_arguments: ['--production'],
      };

      const server: RegistryServer = {
        id: 'yarn-npm',
        name: 'Yarn NPM Server',
        description: 'NPM server using yarn runtime',
        packages: [npmPackage],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Yarn NPM Server',
        command: 'yarn',
        args: ['@test/server', '--production'],
      });
    });

    it('should generate npm package config with pnpm runtime hint', () => {
      const npmPackage: Package = {
        identifier: '@test/server',
        registry_type: 'npm',
        runtime_hint: 'pnpm',
      };

      const server: RegistryServer = {
        id: 'pnpm-npm',
        name: 'PNPM NPM Server',
        description: 'NPM server using pnpm runtime',
        packages: [npmPackage],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'PNPM NPM Server',
        command: 'pnpm',
        args: ['@test/server'],
      });
    });

    it('should generate npm package config with custom runtime hint', () => {
      const npmPackage: Package = {
        identifier: '@test/server',
        registry_type: 'npm',
        runtime_hint: 'bunx',
        package_arguments: ['--env', 'production'],
      };

      const server: RegistryServer = {
        id: 'bunx-npm',
        name: 'Bunx NPM Server',
        description: 'NPM server using bunx runtime',
        packages: [npmPackage],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Bunx NPM Server',
        command: 'bunx',
        args: ['@test/server', '--env', 'production'],
      });
    });

    it('should generate pypi package config', () => {
      const pypiPackage: Package = {
        identifier: 'mcp-python-server',
        registry_type: 'pypi',
        runtime_hint: 'python',
        package_arguments: ['--verbose', '--port', '8080'],
        environment_variables: [
          { name: 'PYTHONPATH', value: '/opt/mcp' },
          { name: 'LOG_LEVEL', value: 'INFO' },
        ],
      };

      const server: RegistryServer = {
        id: 'pypi-server',
        name: 'Python MCP Server',
        description: 'MCP server from PyPI',
        packages: [pypiPackage],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Python MCP Server',
        command: 'python',
        args: ['mcp-python-server', '--verbose', '--port', '8080'],
        env: {
          PYTHONPATH: '/opt/mcp',
          LOG_LEVEL: 'INFO',
        },
      });
    });

    it('should generate pypi package config without environment variables', () => {
      const pypiPackage: Package = {
        identifier: 'basic-python-server',
        registry_type: 'pypi',
        package_arguments: ['--minimal'],
      };

      const server: RegistryServer = {
        id: 'basic-pypi',
        name: 'Basic Python Server',
        description: 'Basic server with minimal config',
        packages: [pypiPackage],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Basic Python Server',
        command: 'uvx',
        args: ['basic-python-server', '--minimal'],
      });
    });

    it('should generate oci container config', () => {
      const ociPackage: Package = {
        identifier: 'ghcr.io/example/mcp-server:v1.2.3',
        registry_type: 'oci',
        package_arguments: ['--port', '3000', '--host', '0.0.0.0'],
        environment_variables: [
          { name: 'PORT', value: '3000' },
          { name: 'HOST', value: '0.0.0.0' },
          { name: 'SECRET_KEY', is_required: true },
        ],
      };

      const server: RegistryServer = {
        id: 'oci-server',
        name: 'Containerized MCP Server',
        description: 'MCP server running in container',
        packages: [ociPackage],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Containerized MCP Server',
        command: 'docker',
        args: [
          'run',
          '-i',
          '--rm',
          'ghcr.io/example/mcp-server:v1.2.3',
          '--port',
          '3000',
          '--host',
          '0.0.0.0',
        ],
        env: {
          PORT: '3000',
          HOST: '0.0.0.0',
        },
      });
    });

    it('should generate oci container config with minimal setup', () => {
      const ociPackage: Package = {
        identifier: 'docker.io/mcp/server:latest',
        registry_type: 'oci',
      };

      const server: RegistryServer = {
        id: 'minimal-oci',
        name: 'Minimal Container Server',
        description: 'Minimal containerized server',
        packages: [ociPackage],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Minimal Container Server',
        command: 'docker',
        args: ['run', '-i', '--rm', 'docker.io/mcp/server:latest'],
      });
    });

    it('should generate github package config', () => {
      const githubPackage: Package = {
        identifier: 'owner/repo',
        registry_type: 'github',
        runtime_hint: 'node',
        package_arguments: ['start', '--production'],
        environment_variables: [{ name: 'NODE_ENV', value: 'production' }],
      };

      const server: RegistryServer = {
        id: 'github-server',
        name: 'GitHub MCP Server',
        description: 'MCP server from GitHub repository',
        packages: [githubPackage],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'GitHub MCP Server',
        command: 'node',
        args: ['github:owner/repo', 'start', '--production'],
        env: {
          NODE_ENV: 'production',
        },
      });
    });

    it('should generate remote server config with SSE transport', () => {
      const remote: Remote = {
        type: 'sse',
        url: 'https://api.example.com/mcp/events',
        headers: [
          { name: 'Authorization', value: 'Bearer ${API_TOKEN}' },
          { name: 'Content-Type', value: 'text/event-stream' },
          { name: 'Accept', value: 'text/event-stream' },
        ],
      };

      const server: RegistryServer = {
        id: 'remote-sse',
        name: 'Remote SSE Server',
        description: 'Server accessed via Server-Sent Events',
        remotes: [remote],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Remote SSE Server',
        transport: 'sse',
        url: 'https://api.example.com/mcp/events',
        headers: [
          { name: 'Authorization', value: 'Bearer ${API_TOKEN}' },
          { name: 'Content-Type', value: 'text/event-stream' },
          { name: 'Accept', value: 'text/event-stream' },
        ],
      });
    });

    it('should generate remote server config with WebSocket transport', () => {
      const remote: Remote = {
        type: 'websocket',
        url: 'wss://websocket.example.com/mcp',
        headers: [
          { name: 'Authorization', value: 'Bearer ${WS_TOKEN}' },
          { name: 'Sec-WebSocket-Protocol', value: 'mcp-v1' },
        ],
      };

      const server: RegistryServer = {
        id: 'remote-ws',
        name: 'Remote WebSocket Server',
        description: 'Server accessed via WebSocket',
        remotes: [remote],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Remote WebSocket Server',
        transport: 'websocket',
        url: 'wss://websocket.example.com/mcp',
        headers: [
          { name: 'Authorization', value: 'Bearer ${WS_TOKEN}' },
          { name: 'Sec-WebSocket-Protocol', value: 'mcp-v1' },
        ],
      });
    });

    it('should generate remote server config without headers', () => {
      const remote: Remote = {
        type: 'stdio',
        url: 'http://localhost:3000/mcp',
      };

      const server: RegistryServer = {
        id: 'local-remote',
        name: 'Local Remote Server',
        description: 'Local server accessed remotely',
        remotes: [remote],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Local Remote Server',
        transport: 'stdio',
        url: 'http://localhost:3000/mcp',
      });
    });
  });
});
