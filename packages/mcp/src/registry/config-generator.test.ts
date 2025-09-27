import { describe, it, expect } from 'vitest';
import {
  generateConfigSnippet,
  generateInstallInstructions,
} from './config-generator.js';
import { RegistryServer } from './types/registry.types.js';
import {
  PACKAGES,
  REMOTES,
  ENV_VARS,
  createServer,
  NPM_RUNTIME_TEST_CASES,
  REGISTRY_TYPE_TEST_CASES,
  COMPLEX_ENV_VARS,
  INSTALL_INSTRUCTION_TEST_CASES,
} from './__fixtures__/config-generator.fixtures.js';
import {
  assertConfigMatches,
  createPackageServer,
  validateInstallInstructionsJson,
  assertInstructionsContain,
  assertEnvironmentVariables,
  assertFirstItemPreference,
  assertRuntimeArguments,
} from './__helpers__/config-generator.helpers.js';

describe('Config Generation', () => {
  describe('generateConfigSnippet', () => {
    it.each(NPM_RUNTIME_TEST_CASES)(
      'should generate config for $name',
      ({ package: pkg, expected }) => {
        const server = createPackageServer(
          'test',
          'Test Server',
          'Test description',
          pkg,
        );
        assertConfigMatches(server, expected);
      },
    );

    it.each(REGISTRY_TYPE_TEST_CASES)(
      'should generate config for $registryType packages',
      ({ registryType, package: pkg, expected }) => {
        const server = createPackageServer(
          'test',
          `${registryType} Server`,
          'Test description',
          pkg,
        );
        assertConfigMatches(server, expected);
      },
    );

    it('should generate pypi package config with environment variables', () => {
      const server = createPackageServer(
        'pypi-test',
        'Python MCP Server',
        'Test description',
        PACKAGES.pypi.withEnv,
      );
      assertConfigMatches(server, {
        command: 'python',
        args: ['mcp-python-server', '--verbose', '--port', '8080'],
        env: { PYTHONPATH: '/opt/mcp', LOG_LEVEL: 'INFO' },
      });
    });

    it('should generate oci container config with environment variables', () => {
      const server = createPackageServer(
        'oci-test',
        'Containerized MCP Server',
        'Test description',
        PACKAGES.oci.withEnv,
      );
      assertConfigMatches(server, {
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
        env: { PORT: '3000', HOST: '0.0.0.0' },
      });
    });

    it('should generate github package config', () => {
      const server = createPackageServer(
        'github-test',
        'GitHub MCP Server',
        'Test description',
        PACKAGES.github.simple,
      );
      assertConfigMatches(server, {
        command: 'node',
        args: ['github:owner/repo', 'start', '--production'],
        env: { NODE_ENV: 'production' },
      });
    });

    it('should use runtime_arguments when provided with runtime_hint', () => {
      assertRuntimeArguments(
        PACKAGES.npm.withRuntimeArgs,
        'Test Server with Runtime Args',
        'npx',
        ['-y', '--no-install', '@test/server', '--verbose'],
      );
    });

    it('should not auto-add -y flag when runtime_hint provided without runtime_arguments', () => {
      const pkg = {
        identifier: '@test/server',
        registry_type: 'npm' as const,
        runtime_hint: 'npx',
        package_arguments: ['--verbose'],
      };
      assertRuntimeArguments(pkg, 'Test Server with Hint Only', 'npx', [
        '@test/server',
        '--verbose',
      ]);
    });

    const remoteTestCases = [
      {
        name: 'SSE transport',
        remote: REMOTES.sse,
        expected: {
          transport: 'sse',
          url: 'https://api.example.com/mcp/events',
          headers: REMOTES.sse.headers,
        },
      },
      {
        name: 'WebSocket transport',
        remote: REMOTES.websocket,
        expected: {
          transport: 'websocket',
          url: 'wss://websocket.example.com/mcp',
          headers: REMOTES.websocket.headers,
        },
      },
      {
        name: 'stdio transport without headers',
        remote: REMOTES.stdio,
        expected: {
          transport: 'stdio',
          url: 'http://localhost:3000/mcp',
        },
      },
    ];

    it.each(remoteTestCases)(
      'should generate remote server config with $name',
      ({ remote, expected }) => {
        const server = createServer(
          'remote-test',
          'Remote Test Server',
          'Test description',
          {
            remotes: [remote],
          },
        );
        assertConfigMatches(server, expected);
      },
    );

    it('should handle environment variables array to object conversion', () => {
      const pkg = {
        identifier: 'env-test-server',
        registry_type: 'npm' as const,
        environment_variables: COMPLEX_ENV_VARS,
      };
      const server = createPackageServer(
        'env-test',
        'Environment Test Server',
        'Test description',
        pkg,
      );

      // Should only include variables with values (excluding required-only vars)
      assertEnvironmentVariables(server, {
        VAR1: 'value1',
        VAR2: 'value2',
        VAR4: '',
      });
    });

    const edgeCaseTests = [
      {
        name: 'unknown registry types',
        server: createPackageServer(
          'unknown-type',
          'Unknown Registry Type Server',
          'Test description',
          PACKAGES.unknown,
        ),
        expected: {
          _raw_metadata: createPackageServer(
            'unknown-type',
            'Unknown Registry Type Server',
            'Test description',
            PACKAGES.unknown,
          ),
        },
      },
      {
        name: 'no packages or remotes',
        server: createServer(
          'empty-server',
          'Empty Server',
          'Server with no configuration',
          {},
        ),
        expected: {
          _raw_metadata: createServer(
            'empty-server',
            'Empty Server',
            'Server with no configuration',
            {},
          ),
        },
      },
    ];

    it.each(edgeCaseTests)(
      'should return raw metadata for $name',
      ({ server, expected }) => {
        assertConfigMatches(server, expected);
      },
    );

    it('should prefer packages over remotes when both exist', () => {
      const server = createServer(
        'hybrid-server',
        'Hybrid Server',
        'Test description',
        {
          packages: [
            { identifier: '@preferred/package', registry_type: 'npm' },
          ],
          remotes: [{ type: 'sse', url: 'https://should.not.be.used.com/mcp' }],
        },
      );
      assertFirstItemPreference(server, 'packages', {
        command: 'npx',
        args: ['-y', '@preferred/package'],
      });
    });

    it('should use first package when multiple packages exist', () => {
      const packages = [
        { identifier: '@first/package', registry_type: 'npm' as const },
        { identifier: 'second-package', registry_type: 'pypi' as const },
      ];
      const server = createServer(
        'multi-package',
        'Multi Package Server',
        'Test description',
        { packages },
      );
      assertFirstItemPreference(server, 'packages', {
        command: 'npx',
        args: ['-y', '@first/package'],
      });
    });

    it('should use first remote when multiple remotes exist', () => {
      const remotes = [
        { type: 'sse', url: 'https://first.example.com/mcp' },
        { type: 'websocket', url: 'wss://second.example.com/mcp' },
      ];
      const server = createServer(
        'multi-remote',
        'Multi Remote Server',
        'Test description',
        { remotes },
      );
      assertFirstItemPreference(server, 'remotes', {
        transport: 'sse',
        url: 'https://first.example.com/mcp',
      });
    });
  });

  describe('generateInstallInstructions - JSON Validity', () => {
    const jsonValidityTests = [
      {
        name: 'string environment variables',
        server: createPackageServer(
          'test-server',
          'Test Server',
          'Test with env vars',
          {
            identifier: '@test/server',
            registry_type: 'npm' as const,
            environment_variables: [
              { name: 'NODE_ENV', value: 'production' },
              { name: 'API_KEY', value: 'sk-1234567890' },
              { name: 'PORT', value: '8080' },
              { name: 'DEBUG', value: 'true' },
            ],
          },
        ),
      },
      {
        name: 'quoted package arguments',
        server: createPackageServer(
          'quoted-args-server',
          'Quoted Args Server',
          'Test with quotes',
          PACKAGES.npm.withQuotedArgs,
        ),
      },
    ];

    it.each(jsonValidityTests)(
      'should generate valid JSON with $name',
      ({ server }) => {
        validateInstallInstructionsJson(server);
      },
    );

    it('should emit valid JSON when remote headers contain quotes', () => {
      const server = createServer(
        'quoted-headers-remote',
        'Quoted Headers Remote',
        'Test with quoted headers',
        {
          remotes: [REMOTES.withQuotedHeaders],
        },
      );
      validateInstallInstructionsJson(server);
    });
  });

  describe('generateInstallInstructions', () => {
    it.each(INSTALL_INSTRUCTION_TEST_CASES)(
      'should generate helpful instructions for $name',
      ({ server, expectedContent }) => {
        assertInstructionsContain(server, expectedContent);
      },
    );

    it('should generate helpful instructions for remote servers', () => {
      const server = createServer(
        'remote-instructions',
        'Remote Instructions Server',
        'Test remote instructions',
        {
          remotes: [
            {
              type: 'sse',
              url: 'https://api.example.com/mcp',
              headers: [
                { name: 'Authorization', value: 'Bearer ${API_TOKEN}' },
              ],
            },
          ],
        },
      );
      assertInstructionsContain(server, [
        'remote',
        'https://api.example.com/mcp',
        'API_TOKEN',
        'authentication',
      ]);
    });

    it('should handle servers with no installation requirements', () => {
      const server = createPackageServer(
        'no-install',
        'No Install Server',
        'Simple server',
        {
          identifier: 'simple-server',
          registry_type: 'npm' as const,
        },
      );
      const instructions = generateInstallInstructions(server);
      expect(instructions).toBeTruthy();
      expect(instructions.length).toBeGreaterThan(0);
      expect(instructions).toContain('simple-server');
    });

    it('should provide fallback instructions for unknown types', () => {
      const server = createPackageServer(
        'unknown-instructions',
        'Unknown Type Server',
        'Test unknown type',
        {
          identifier: 'unknown-package',
          registry_type: 'unknown' as 'npm',
        },
      );
      assertInstructionsContain(server, [
        'manual',
        'configuration',
        'unknown-package',
      ]);
    });

    it('should mention required environment variables prominently', () => {
      const server = createPackageServer(
        'required-env',
        'Required Environment Server',
        'Test env vars',
        {
          identifier: 'env-server',
          registry_type: 'npm' as const,
          environment_variables: [
            { name: 'REQUIRED_VAR1', is_required: true },
            { name: 'REQUIRED_VAR2', is_required: true },
            { name: 'OPTIONAL_VAR', value: 'default' },
          ],
        },
      );
      const instructions = generateInstallInstructions(server);
      const requiredMatches = instructions.match(/REQUIRED_VAR\d/g);
      expect(requiredMatches).toHaveLength(2);
      assertInstructionsContain(server, [
        'REQUIRED_VAR1',
        'REQUIRED_VAR2',
        'required',
        'Environment',
      ]);
    });

    it('should provide step-by-step format', () => {
      const server = createPackageServer(
        'step-by-step',
        'Step by Step Server',
        'Test step format',
        {
          identifier: '@step/server',
          registry_type: 'npm' as const,
        },
      );
      const instructions = generateInstallInstructions(server);
      expect(instructions).toMatch(/\d+\.|•|-/);
      expect(instructions).toContain('configuration');
    });
  });
});
