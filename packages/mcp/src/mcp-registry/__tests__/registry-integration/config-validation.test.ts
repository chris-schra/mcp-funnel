/**
 * Tests for config generation validation
 */

import { describe, it, expect } from 'vitest';
import {
  generateConfigSnippet,
  setupRegistryIntegrationTest,
  type RegistryServer,
  type KeyValueInput,
  type EnvironmentVariable,
} from './test-utils.js';

describe('Registry Integration Tests', () => {
  setupRegistryIntegrationTest();

  describe('Config Generation Validation', () => {
    it('should validate NPM configs use npx with correct arguments', () => {
      const server: RegistryServer = {
        id: 'npm-validation',
        name: 'NPM Validation Server',
        description: 'Server for NPM config validation',
        packages: [
          {
            identifier: '@validation/server',
            registry_type: 'npm',
            package_arguments: ['--flag1', '--flag2'],
          },
        ],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('npx');
      expect(config.args![0]).toBe('-y');
      expect(config.args![1]).toBe('@validation/server');
      expect(config.args).toContain('--flag1');
      expect(config.args).toContain('--flag2');
    });

    it('should validate PyPI configs use uvx with correct arguments', () => {
      const server: RegistryServer = {
        id: 'pypi-validation',
        name: 'PyPI Validation Server',
        description: 'Server for PyPI config validation',
        packages: [
          {
            identifier: 'validation-server',
            registry_type: 'pypi',
            package_arguments: ['--debug', '--port', '5000'],
          },
        ],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('uvx');
      expect(config.args![0]).toBe('validation-server');
      expect(config.args).toContain('--debug');
      expect(config.args).toContain('--port');
      expect(config.args).toContain('5000');
    });

    it('should validate OCI configs use docker with proper flags', () => {
      const server: RegistryServer = {
        id: 'oci-validation',
        name: 'OCI Validation Server',
        description: 'Server for OCI config validation',
        packages: [
          {
            identifier: 'registry.example.com/validation:latest',
            registry_type: 'oci',
            package_arguments: ['--mount', '/data'],
          },
        ],
      };

      const config = generateConfigSnippet(server);

      expect(config.command).toBe('docker');
      expect(config.args).toEqual([
        'run',
        '-i',
        '--rm',
        'registry.example.com/validation:latest',
        '--mount',
        '/data',
      ]);
    });

    it('should validate remote configs have proper transport and headers', () => {
      const headers: KeyValueInput[] = [
        {
          name: 'X-Auth-Token',
          value: 'secret123',
          is_required: true,
          is_secret: true,
        },
        { name: 'Content-Type', value: 'application/json', is_required: false },
      ];

      const server: RegistryServer = {
        id: 'remote-validation',
        name: 'Remote Validation Server',
        description: 'Server for remote config validation',
        remotes: [
          {
            type: 'sse',
            url: 'https://validation.example.com/events',
            headers,
          },
        ],
      };

      const config = generateConfigSnippet(server);

      expect(config.transport).toBe('sse');
      expect(config.url).toBe('https://validation.example.com/events');
      expect(config.headers).toEqual(headers);

      // Verify header structure
      expect(Array.isArray(config.headers)).toBe(true);
      const authHeader = (config.headers as KeyValueInput[]).find((h) => h.name === 'X-Auth-Token');
      expect(authHeader).toBeTruthy();
      expect(authHeader!.is_required).toBe(true);
      expect(authHeader!.is_secret).toBe(true);
    });

    it('should handle environment variables correctly with is_required field', () => {
      const envVars: EnvironmentVariable[] = [
        { name: 'REQUIRED_VAR', is_required: true },
        { name: 'OPTIONAL_VAR', value: 'default_value', is_required: false },
        { name: 'ANOTHER_REQUIRED', is_required: true },
        { name: 'WITH_VALUE', value: 'some_value' },
      ];

      const server: RegistryServer = {
        id: 'env-validation',
        name: 'Environment Validation Server',
        description: 'Server for environment variable validation',
        packages: [
          {
            identifier: 'env-server',
            registry_type: 'npm',
            environment_variables: envVars,
          },
        ],
      };

      const config = generateConfigSnippet(server);

      // Should only include variables with values (not required-only vars)
      expect(config.env).toEqual({
        OPTIONAL_VAR: 'default_value',
        WITH_VALUE: 'some_value',
      });

      // Required-only variables without values should not be included
      expect(config.env).not.toHaveProperty('REQUIRED_VAR');
      expect(config.env).not.toHaveProperty('ANOTHER_REQUIRED');
    });
  });
});
