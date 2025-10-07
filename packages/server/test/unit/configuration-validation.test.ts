import { describe, it, expect } from 'vitest';
import {
  validateAuthConfig,
  type InboundBearerAuthConfig,
  type InboundNoAuthConfig,
  type InboundAuthConfig,
} from '../../src/auth/index.js';
import type { InvalidAuthConfig } from './test-utils.js';

describe('Configuration Validation', () => {
  it('should validate bearer auth config correctly', () => {
    const validConfig: InboundBearerAuthConfig = {
      type: 'bearer',
      tokens: ['token1', 'token2'],
    };

    expect(() => validateAuthConfig(validConfig)).not.toThrow();
  });

  it('should validate no-auth config correctly', () => {
    const validConfig: InboundNoAuthConfig = {
      type: 'none',
    };

    expect(() => validateAuthConfig(validConfig)).not.toThrow();
  });

  it('should reject config without type', () => {
    const invalidConfig = {} as unknown as InboundBearerAuthConfig;

    expect(() => validateAuthConfig(invalidConfig)).toThrow(
      'Authentication configuration must specify a type',
    );
  });

  it('should reject bearer config without tokens', () => {
    const invalidConfig = {
      type: 'bearer',
    } as InboundBearerAuthConfig;

    expect(() => validateAuthConfig(invalidConfig)).toThrow(
      'Bearer authentication requires a tokens array',
    );
  });

  it('should reject bearer config with empty tokens array', () => {
    const invalidConfig: InboundBearerAuthConfig = {
      type: 'bearer',
      tokens: [],
    };

    expect(() => validateAuthConfig(invalidConfig)).toThrow(
      'Bearer authentication requires at least one token',
    );
  });

  it('should reject unsupported auth type', () => {
    const invalidConfig: InvalidAuthConfig = {
      type: 'unsupported',
    };

    expect(() => validateAuthConfig(invalidConfig as InboundAuthConfig)).toThrow(
      'Unsupported authentication type: unsupported',
    );
  });
});
