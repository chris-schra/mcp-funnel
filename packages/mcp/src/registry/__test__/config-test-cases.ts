/**
 * Parameterized test cases for configuration generation validation.
 * Consolidates repetitive config validation tests into data-driven test cases.
 */

import { configTestServers } from './test-fixtures.js';
import type { ConfigTestCase } from './test-utils.js';
import type { RegistryServer } from '../types/registry.types.js';

/**
 * Test cases for package type configuration validation
 */
export const packageTypeConfigCases: ConfigTestCase<RegistryServer>[] = [
  {
    name: 'NPM package with npx command',
    server: configTestServers.npm,
    expected: {
      command: 'npx',
      args: ['-y', '@validation/server', '--flag1', '--flag2'],
    },
  },
  {
    name: 'PyPI package with uvx command',
    server: configTestServers.pypi,
    expected: {
      command: 'uvx',
      args: ['validation-server', '--debug', '--port', '5000'],
    },
  },
  {
    name: 'OCI package with docker command',
    server: configTestServers.oci,
    expected: {
      command: 'docker',
      args: [
        'run',
        '-i',
        '--rm',
        'registry.example.com/validation:latest',
        '--mount',
        '/data',
      ],
    },
  },
];

/**
 * Test cases for remote configuration validation
 */
export const remoteConfigCases: ConfigTestCase<RegistryServer>[] = [
  {
    name: 'Remote SSE server with headers',
    server: configTestServers.remote,
    expected: {
      transport: 'sse',
      url: 'https://validation.example.com/events',
    },
  },
  {
    name: 'Simple remote server without headers',
    server: configTestServers.simpleRemote,
    expected: {
      transport: 'stdio',
      url: 'http://localhost:3000/mcp',
    },
  },
];

/**
 * Test cases for environment variable handling
 */
export const environmentVariableCases: ConfigTestCase<RegistryServer>[] = [
  {
    name: 'Environment variables - only values included',
    server: configTestServers.env,
    expected: {
      env: {
        OPTIONAL_VAR: 'default_value',
        WITH_VALUE: 'some_value',
      },
    },
  },
  {
    name: 'No environment variables',
    server: configTestServers.simple,
    expected: {
      command: 'npx',
      args: ['-y', 'simple-package', '--simple'],
    },
  },
];

/**
 * Test cases for backward compatibility
 */
export const backwardCompatibilityCases: ConfigTestCase<RegistryServer>[] = [
  {
    name: 'Package without environment_variables field',
    server: configTestServers.simple,
    expected: {
      command: 'npx',
      args: ['-y', 'simple-package', '--simple'],
    },
  },
  {
    name: 'Remote without headers field',
    server: configTestServers.simpleRemote,
    expected: {
      transport: 'stdio',
      url: 'http://localhost:3000/mcp',
    },
  },
  {
    name: 'Old format server with missing registry_type',
    server: configTestServers.oldFormat,
    expected: {
      // Should have _raw_metadata for unknown types
    },
  },
];

/**
 * Test cases for argument validation
 */
export const argumentValidationCases = [
  {
    name: 'NPM config argument validation',
    server: configTestServers.npm,
    validate: (config: Record<string, unknown>) => {
      const args = config.args as string[];
      expect(args[0]).toBe('-y');
      expect(args[1]).toBe('@validation/server');
      expect(args).toContain('--flag1');
      expect(args).toContain('--flag2');
    },
  },
  {
    name: 'PyPI config argument validation',
    server: configTestServers.pypi,
    validate: (config: Record<string, unknown>) => {
      const args = config.args as string[];
      expect(args[0]).toBe('validation-server');
      expect(args).toContain('--debug');
      expect(args).toContain('--port');
      expect(args).toContain('5000');
    },
  },
  {
    name: 'OCI config docker flags validation',
    server: configTestServers.oci,
    validate: (config: Record<string, unknown>) => {
      expect(config.args).toEqual([
        'run',
        '-i',
        '--rm',
        'registry.example.com/validation:latest',
        '--mount',
        '/data',
      ]);
    },
  },
];

/**
 * Header validation test cases
 */
export const headerValidationCases = [
  {
    name: 'Remote headers structure validation',
    server: configTestServers.remote,
    validate: (config: Record<string, unknown>) => {
      expect(Array.isArray(config.headers)).toBe(true);
      const headers = config.headers as Array<{
        name: string;
        is_required?: boolean;
        is_secret?: boolean;
      }>;
      const authHeader = headers.find((h) => h.name === 'X-Auth-Token');
      expect(authHeader).toBeTruthy();
      expect(authHeader!.is_required).toBe(true);
      expect(authHeader!.is_secret).toBe(true);
    },
  },
];

/**
 * Environment variable exclusion test cases
 */
export const envExclusionCases = [
  {
    name: 'Required-only variables excluded',
    server: configTestServers.env,
    validate: (config: Record<string, unknown>) => {
      expect(config.env).not.toHaveProperty('REQUIRED_VAR');
      expect(config.env).not.toHaveProperty('ANOTHER_REQUIRED');
    },
  },
];
