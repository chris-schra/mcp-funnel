import { expect } from 'vitest';
import {
  ProxyConfigSchema,
  TargetServerSchema,
  SecretProviderConfigSchema,
  normalizeServers,
} from '../config.js';
import type { ProxyConfig, TargetServerZod } from '../config.js';
import type { SecretProviderConfig } from './provider-configs.js';

// Schema validation helpers
export const expectValidSchema = <T>(schema: any, input: T): T => {
  const result = schema.parse(input);
  expect(result).toEqual(input);
  return result;
};

export const expectSchemaError = (schema: any, input: any): void => {
  expect(() => schema.parse(input)).toThrow();
};

// Server validation helpers
export const expectValidServer = (server: TargetServerZod): TargetServerZod =>
  expectValidSchema(TargetServerSchema, server);

export const expectValidConfig = (config: ProxyConfig): ProxyConfig =>
  expectValidSchema(ProxyConfigSchema, config);

export const expectValidProvider = (
  provider: SecretProviderConfig,
): SecretProviderConfig =>
  expectValidSchema(SecretProviderConfigSchema, provider);

// Assertion helpers for complex configurations
export const assertServerStructure = (
  server: TargetServerZod,
  expectedProviderCount?: number,
): void => {
  expect(server.name).toBeDefined();
  expect(server.command).toBeDefined();

  if (expectedProviderCount !== undefined) {
    expect(server.secretProviders).toHaveLength(expectedProviderCount);
  }
};

export const assertConfigStructure = (
  config: ProxyConfig,
  expectedServerCount: number,
  expectedDefaultProviders?: number,
  expectedPassthroughCount?: number,
): void => {
  expect(config.servers).toHaveLength(expectedServerCount);

  if (expectedDefaultProviders !== undefined) {
    expect(config.defaultSecretProviders).toHaveLength(
      expectedDefaultProviders,
    );
  }

  if (expectedPassthroughCount !== undefined) {
    expect(config.defaultPassthroughEnv).toHaveLength(expectedPassthroughCount);
  }
};

// Normalized server helpers
export const assertNormalizedServers = (
  config: ProxyConfig,
  assertions: Array<{
    index: number;
    name: string;
    providerCount?: number;
    hasEnv?: boolean;
  }>,
): void => {
  const normalizedServers = normalizeServers(config.servers);

  assertions.forEach(({ index, name, providerCount, hasEnv }) => {
    const server = normalizedServers[index];
    expect(server.name).toBe(name);

    if (providerCount !== undefined) {
      expect(server.secretProviders).toHaveLength(providerCount);
    }

    if (hasEnv !== undefined) {
      if (hasEnv) {
        expect(server.env).toBeDefined();
      } else {
        expect(server.env).toBeUndefined();
      }
    }
  });
};

// Provider type assertion helpers
export const assertProviderTypes = (
  server: TargetServerZod,
  expectedTypes: string[],
): void => {
  expect(server.secretProviders).toHaveLength(expectedTypes.length);
  expectedTypes.forEach((type, index) => {
    expect(server.secretProviders?.[index]?.type).toBe(type);
  });
};
