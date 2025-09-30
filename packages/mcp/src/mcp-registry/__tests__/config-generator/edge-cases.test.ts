import { describe, it, expect } from 'vitest';
import {
  generateConfigSnippet,
  type RegistryServer,
  type Package,
  type Remote,
  type EnvironmentVariable,
} from './test-utils.js';

describe('Config Generation', () => {
  describe('generateConfigSnippet - Edge Cases', () => {
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
});
