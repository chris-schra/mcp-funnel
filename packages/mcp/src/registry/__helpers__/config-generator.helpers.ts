import { expect } from 'vitest';
import {
  generateConfigSnippet,
  generateInstallInstructions,
} from '../config-generator.js';
import { RegistryServer, Package } from '../types/registry.types.js';
import { RegistryConfigEntry } from '../types/config.types.js';

/**
 * Helper to assert generated config matches expected structure
 */
export function assertConfigMatches(
  server: RegistryServer,
  expected: Partial<RegistryConfigEntry>,
): void {
  const result = generateConfigSnippet(server);

  expect(result.name).toBe(server.name);

  if (expected.command) {
    expect(result.command).toBe(expected.command);
  }

  if (expected.args) {
    expect(result.args).toEqual(expected.args);
  }

  if (expected.env) {
    expect(result.env).toEqual(expected.env);
  }

  if (expected.transport) {
    expect(result.transport).toBe(expected.transport);
  }

  if (expected.url) {
    expect(result.url).toBe(expected.url);
  }

  if (expected.headers) {
    expect(result.headers).toEqual(expected.headers);
  }

  if (expected._raw_metadata) {
    expect(result._raw_metadata).toEqual(expected._raw_metadata);
  }
}

/**
 * Helper to create a server with a single package
 */
export function createPackageServer(
  id: string,
  name: string,
  description: string,
  pkg: Package,
): RegistryServer {
  return {
    id,
    name,
    description,
    packages: [pkg],
  };
}

/**
 * Helper to validate JSON in install instructions
 */
export function validateInstallInstructionsJson(server: RegistryServer): void {
  const instructions = generateInstallInstructions(server);
  const jsonMatch = instructions.match(/```json\n([\s\S]*?)\n```/);

  expect(jsonMatch).toBeTruthy();

  if (jsonMatch) {
    const jsonContent = jsonMatch[1];
    const wrappedJson = `{${jsonContent}}`;

    // Should not throw if JSON is valid
    expect(() => JSON.parse(wrappedJson)).not.toThrow();

    return JSON.parse(wrappedJson);
  }
}

/**
 * Helper to assert install instructions contain expected content
 */
export function assertInstructionsContain(
  server: RegistryServer,
  expectedContent: string[],
): void {
  const instructions = generateInstallInstructions(server);

  expectedContent.forEach((content) => {
    expect(instructions).toContain(content);
  });
}

/**
 * Helper to test environment variable handling
 */
export function assertEnvironmentVariables(
  server: RegistryServer,
  expectedEnv: Record<string, string>,
): void {
  const result = generateConfigSnippet(server);
  expect(result.env).toEqual(expectedEnv);
}

/**
 * Helper to test multiple packages/remotes preference
 */
export function assertFirstItemPreference<T extends 'packages' | 'remotes'>(
  server: RegistryServer,
  property: T,
  expectedConfig: Partial<RegistryConfigEntry>,
): void {
  const result = generateConfigSnippet(server);

  Object.entries(expectedConfig).forEach(([key, value]) => {
    if (key === 'args') {
      expect(result[key as keyof RegistryConfigEntry]).toEqual(value);
    } else {
      expect(result[key as keyof RegistryConfigEntry]).toBe(value);
    }
  });
}

/**
 * Helper to test runtime arguments functionality
 */
export function assertRuntimeArguments(
  pkg: Package,
  serverName: string,
  expectedCommand: string,
  expectedArgs: string[],
): void {
  const server = createPackageServer('test', serverName, 'Test server', pkg);
  const result = generateConfigSnippet(server);

  expect(result.command).toBe(expectedCommand);
  expect(result.args).toEqual(expectedArgs);
}
