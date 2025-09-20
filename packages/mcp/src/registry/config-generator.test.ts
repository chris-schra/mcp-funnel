import { describe, it, expect } from 'vitest';
import {
  generateConfigSnippet,
  generateInstallInstructions,
} from './config-generator.js';
import {
  RegistryServer,
  Package,
  Remote,
  EnvironmentVariable,
} from './types/registry.types.js';

describe('Config Generation', () => {
  describe('generateConfigSnippet', () => {
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

    it('should use runtime_arguments when provided with runtime_hint', () => {
      const packageWithRuntimeArgs: Package = {
        identifier: '@test/server',
        registry_type: 'npm',
        runtime_hint: 'npx',
        runtime_arguments: ['-y', '--no-install'],
        package_arguments: ['--verbose'],
      };

      const server: RegistryServer = {
        id: 'test-server',
        name: 'Test Server with Runtime Args',
        description: 'Server testing runtime_arguments functionality',
        packages: [packageWithRuntimeArgs],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Test Server with Runtime Args',
        command: 'npx',
        args: ['-y', '--no-install', '@test/server', '--verbose'],
      });
    });

    it('should not auto-add -y flag when runtime_hint provided without runtime_arguments', () => {
      const packageWithHintOnly: Package = {
        identifier: '@test/server',
        registry_type: 'npm',
        runtime_hint: 'npx',
        package_arguments: ['--verbose'],
      };

      const server: RegistryServer = {
        id: 'test-server-hint-only',
        name: 'Test Server with Hint Only',
        description: 'Server testing runtime_hint without runtime_arguments',
        packages: [packageWithHintOnly],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Test Server with Hint Only',
        command: 'npx',
        args: ['@test/server', '--verbose'],
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

    it('should handle environment variables array to object conversion', () => {
      const envVars: EnvironmentVariable[] = [
        { name: 'VAR1', value: 'value1' },
        { name: 'VAR2', value: 'value2', is_required: false },
        { name: 'VAR3', is_required: true }, // No default value
        { name: 'VAR4', value: '', is_required: false }, // Empty string value
        { name: 'VAR5' }, // No value, no required flag
      ];

      const package_: Package = {
        identifier: 'env-test-server',
        registry_type: 'npm',
        environment_variables: envVars,
      };

      const server: RegistryServer = {
        id: 'env-test',
        name: 'Environment Test Server',
        description: 'Server for testing environment variable handling',
        packages: [package_],
      };

      const result = generateConfigSnippet(server);

      // Should only include variables with values (excluding required-only vars)
      expect(result.env).toEqual({
        VAR1: 'value1',
        VAR2: 'value2',
        VAR4: '',
      });
    });

    it('should return raw metadata for unknown registry types', () => {
      const unknownPackage: Package = {
        identifier: 'unknown-package',
        registry_type: 'custom-registry' as 'npm',
        package_arguments: ['--custom'],
      };

      const server: RegistryServer = {
        id: 'unknown-type',
        name: 'Unknown Registry Type Server',
        description: 'Server with unsupported registry type',
        packages: [unknownPackage],
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Unknown Registry Type Server',
        _raw_metadata: server,
      });
    });

    it('should return raw metadata when no packages or remotes', () => {
      const server: RegistryServer = {
        id: 'empty-server',
        name: 'Empty Server',
        description: 'Server with no package or remote configuration',
      };

      const result = generateConfigSnippet(server);

      expect(result).toEqual({
        name: 'Empty Server',
        _raw_metadata: server,
      });
    });

    it('should prefer packages over remotes when both exist', () => {
      const package_: Package = {
        identifier: '@preferred/package',
        registry_type: 'npm',
      };

      const remote: Remote = {
        type: 'sse',
        url: 'https://should.not.be.used.com/mcp',
      };

      const server: RegistryServer = {
        id: 'hybrid-server',
        name: 'Hybrid Server',
        description: 'Server with both package and remote options',
        packages: [package_],
        remotes: [remote],
      };

      const result = generateConfigSnippet(server);

      // Should use package configuration, not remote
      expect(result.command).toBe('npx');
      expect(result.args).toEqual(['-y', '@preferred/package']);
      expect(result.transport).toBeUndefined();
      expect(result.url).toBeUndefined();
    });

    it('should use first package when multiple packages exist', () => {
      const packages: Package[] = [
        {
          identifier: '@first/package',
          registry_type: 'npm',
        },
        {
          identifier: 'second-package',
          registry_type: 'pypi',
        },
      ];

      const server: RegistryServer = {
        id: 'multi-package',
        name: 'Multi Package Server',
        description: 'Server with multiple package options',
        packages,
      };

      const result = generateConfigSnippet(server);

      // Should use first package (npm)
      expect(result.command).toBe('npx');
      expect(result.args).toEqual(['-y', '@first/package']);
    });

    it('should use first remote when multiple remotes exist', () => {
      const remotes: Remote[] = [
        {
          type: 'sse',
          url: 'https://first.example.com/mcp',
        },
        {
          type: 'websocket',
          url: 'wss://second.example.com/mcp',
        },
      ];

      const server: RegistryServer = {
        id: 'multi-remote',
        name: 'Multi Remote Server',
        description: 'Server with multiple remote options',
        remotes,
      };

      const result = generateConfigSnippet(server);

      // Should use first remote (SSE)
      expect(result.transport).toBe('sse');
      expect(result.url).toBe('https://first.example.com/mcp');
    });
  });

  describe('generateInstallInstructions - JSON Validity', () => {
    it('should generate valid JSON with properly quoted string environment variables', () => {
      const server: RegistryServer = {
        id: 'test-server',
        name: 'Test Server',
        description: 'Test server with environment variables',
        packages: [
          {
            identifier: '@test/server',
            registry_type: 'npm',
            environment_variables: [
              { name: 'NODE_ENV', value: 'production' },
              { name: 'API_KEY', value: 'sk-1234567890' },
              { name: 'PORT', value: '8080' },
              { name: 'DEBUG', value: 'true' },
            ],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      // Extract JSON from markdown code block
      const jsonMatch = instructions.match(/```json\n([\s\S]*?)\n```/);
      expect(jsonMatch).toBeTruthy();

      if (jsonMatch) {
        const jsonContent = jsonMatch[1];

        // The output is a JSON snippet meant to be part of a larger config
        // Wrap it in braces to make it valid standalone JSON
        const wrappedJson = `{${jsonContent}}`;

        // This should NOT throw if JSON is valid
        expect(() => JSON.parse(wrappedJson)).not.toThrow();

        // Verify the parsed values
        const parsed = JSON.parse(wrappedJson);
        const serverConfig = parsed['Test Server'];
        expect(serverConfig.env.NODE_ENV).toBe('production');
        expect(serverConfig.env.API_KEY).toBe('sk-1234567890');
        expect(serverConfig.env.PORT).toBe('8080');
        expect(serverConfig.env.DEBUG).toBe('true');
      }
    });

    it('should emit valid JSON when package arguments contain quotes', () => {
      const server: RegistryServer = {
        id: 'quoted-args-server',
        name: 'Quoted Args Server',
        description: 'Server with quoted package arguments',
        packages: [
          {
            identifier: '@quote/server',
            registry_type: 'npm',
            package_arguments: ['--flag="value"'],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);
      const jsonMatch = instructions.match(/```json\n([\s\S]*?)\n```/);
      expect(jsonMatch).toBeTruthy();

      if (jsonMatch) {
        const wrappedJson = `{${jsonMatch[1]}}`;

        expect(() => JSON.parse(wrappedJson)).not.toThrow();

        const parsed = JSON.parse(wrappedJson);
        const serverConfig = parsed['Quoted Args Server'];
        expect(serverConfig.command).toBe('npx');
        expect(serverConfig.args).toEqual([
          '-y',
          '@quote/server',
          '--flag="value"',
        ]);
      }
    });

    it('should emit valid JSON when remote headers contain quotes', () => {
      const server: RegistryServer = {
        id: 'quoted-headers-remote',
        name: 'Quoted Headers Remote',
        description: 'Remote server with quoted header values',
        remotes: [
          {
            type: 'sse',
            url: 'https://remote.example.com/mcp',
            headers: [
              { name: 'Authorization', value: 'Bearer "token"' },
              { name: 'X-Custom-Header', value: 'Value with "quotes"' },
            ],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);
      const jsonMatch = instructions.match(/```json\n([\s\S]*?)\n```/);
      expect(jsonMatch).toBeTruthy();

      if (jsonMatch) {
        const wrappedJson = `{${jsonMatch[1]}}`;

        expect(() => JSON.parse(wrappedJson)).not.toThrow();

        const parsed = JSON.parse(wrappedJson);
        const serverConfig = parsed['Quoted Headers Remote'];
        expect(serverConfig.transport).toBe('sse');
        expect(serverConfig.url).toBe('https://remote.example.com/mcp');
        expect(serverConfig.headers.Authorization).toBe('Bearer "token"');
        expect(serverConfig.headers['X-Custom-Header']).toBe(
          'Value with "quotes"',
        );
      }
    });
  });

  describe('generateInstallInstructions', () => {
    it('should generate helpful instructions for npm packages', () => {
      const server: RegistryServer = {
        id: 'npm-instructions',
        name: 'NPM Instructions Server',
        description: 'Server for testing npm installation instructions',
        packages: [
          {
            identifier: '@example/mcp-server',
            registry_type: 'npm',
            environment_variables: [
              { name: 'API_KEY', is_required: true },
              { name: 'DEBUG', value: 'false' },
            ],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toContain('npm');
      expect(instructions).toContain('@example/mcp-server');
      expect(instructions).toContain('API_KEY');
      expect(instructions).toContain('required');
      expect(instructions).toContain('environment variable');
    });

    it('should generate helpful instructions for pypi packages', () => {
      const server: RegistryServer = {
        id: 'pypi-instructions',
        name: 'PyPI Instructions Server',
        description: 'Server for testing PyPI installation instructions',
        packages: [
          {
            identifier: 'mcp-python-server',
            registry_type: 'pypi',
            environment_variables: [{ name: 'PYTHON_PATH', is_required: true }],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toContain('pip');
      expect(instructions).toContain('mcp-python-server');
      expect(instructions).toContain('PYTHON_PATH');
      expect(instructions).toContain('uvx');
    });

    it('should generate helpful instructions for OCI containers', () => {
      const server: RegistryServer = {
        id: 'oci-instructions',
        name: 'OCI Instructions Server',
        description: 'Server for testing OCI installation instructions',
        packages: [
          {
            identifier: 'ghcr.io/example/server:latest',
            registry_type: 'oci',
            environment_variables: [{ name: 'CONTAINER_PORT', value: '3000' }],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toContain('Docker');
      expect(instructions).toContain('container');
      expect(instructions).toContain('ghcr.io/example/server:latest');
      expect(instructions).toContain('docker pull');
    });

    it('should generate helpful instructions for remote servers', () => {
      const server: RegistryServer = {
        id: 'remote-instructions',
        name: 'Remote Instructions Server',
        description: 'Server for testing remote connection instructions',
        remotes: [
          {
            type: 'sse',
            url: 'https://api.example.com/mcp',
            headers: [{ name: 'Authorization', value: 'Bearer ${API_TOKEN}' }],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toContain('remote');
      expect(instructions).toContain('connection');
      expect(instructions).toContain('https://api.example.com/mcp');
      expect(instructions).toContain('API_TOKEN');
      expect(instructions).toContain('authentication');
    });

    it('should handle servers with no installation requirements', () => {
      const server: RegistryServer = {
        id: 'no-install',
        name: 'No Install Server',
        description: 'Server that requires no installation',
        packages: [
          {
            identifier: 'simple-server',
            registry_type: 'npm',
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toBeTruthy();
      expect(instructions.length).toBeGreaterThan(0);
      expect(instructions).toContain('simple-server');
    });

    it('should provide fallback instructions for unknown types', () => {
      const server: RegistryServer = {
        id: 'unknown-instructions',
        name: 'Unknown Type Server',
        description: 'Server with unknown configuration',
        packages: [
          {
            identifier: 'unknown-package',
            registry_type: 'unknown' as 'npm',
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toContain('manual');
      expect(instructions).toContain('configuration');
      expect(instructions).toContain('unknown-package');
    });

    it('should mention required environment variables prominently', () => {
      const server: RegistryServer = {
        id: 'required-env',
        name: 'Required Environment Server',
        description: 'Server with required environment variables',
        packages: [
          {
            identifier: 'env-server',
            registry_type: 'npm',
            environment_variables: [
              { name: 'REQUIRED_VAR1', is_required: true },
              { name: 'REQUIRED_VAR2', is_required: true },
              { name: 'OPTIONAL_VAR', value: 'default' },
            ],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toContain('REQUIRED_VAR1');
      expect(instructions).toContain('REQUIRED_VAR2');
      expect(instructions).toContain('required');
      expect(instructions).toContain('environment');
      // Should mention both required variables
      const requiredMatches = instructions.match(/REQUIRED_VAR\d/g);
      expect(requiredMatches).toHaveLength(2);
    });

    it('should provide step-by-step format', () => {
      const server: RegistryServer = {
        id: 'step-by-step',
        name: 'Step by Step Server',
        description: 'Server for testing step-by-step instructions',
        packages: [
          {
            identifier: '@step/server',
            registry_type: 'npm',
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      // Should contain numbered steps or bullet points
      expect(instructions).toMatch(/\d+\.|•|-/);
      expect(instructions).toContain('configuration');
    });
  });
});
