import { describe, it, expect } from 'vitest';
import {
  createAuthValidator,
  BearerTokenValidator,
  NoAuthValidator,
  type InboundBearerAuthConfig,
  type InboundNoAuthConfig,
  type InboundAuthConfig,
} from '../../src/auth/index.js';
import type { InvalidAuthConfig } from './test-utils.js';

describe('Auth Factory', () => {
  it('should create bearer token validator', () => {
    const config: InboundBearerAuthConfig = {
      type: 'bearer',
      tokens: ['test-token'],
    };

    const validator = createAuthValidator(config);

    expect(validator).toBeInstanceOf(BearerTokenValidator);
    expect(validator.getType()).toBe('bearer');
  });

  it('should create no-auth validator', () => {
    const config: InboundNoAuthConfig = {
      type: 'none',
    };

    const validator = createAuthValidator(config);

    expect(validator).toBeInstanceOf(NoAuthValidator);
    expect(validator.getType()).toBe('none');
  });

  it('should throw error for unsupported type', () => {
    const invalidConfig: InvalidAuthConfig = {
      type: 'unsupported',
    };

    expect(() => createAuthValidator(invalidConfig as InboundAuthConfig)).toThrow(
      'Unsupported authentication type: unsupported',
    );
  });
});
