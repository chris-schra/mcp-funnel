import { describe, it, expect } from 'vitest';
import { TargetServerWithoutNameSchema } from './test-imports.js';

describe('ExtendedTargetServerWithoutNameSchema', () => {
  it('should accept command-only configurations without name', () => {
    const validConfig = {
      command: 'node',
      args: ['server.js'],
      env: { NODE_ENV: 'test' },
    };

    expect(() => TargetServerWithoutNameSchema.parse(validConfig)).not.toThrow();
    const result = TargetServerWithoutNameSchema.parse(validConfig);
    expect(result.command).toBe('node');
    expect(result.args).toEqual(['server.js']);
  });

  it('should accept transport-only configurations without name', () => {
    const validConfig = {
      transport: {
        type: 'sse' as const,
        url: 'https://api.example.com/events',
      },
      auth: {
        type: 'bearer' as const,
        token: 'test-token',
      },
    };

    expect(() => TargetServerWithoutNameSchema.parse(validConfig)).not.toThrow();
    const result = TargetServerWithoutNameSchema.parse(validConfig);
    expect(result.transport?.type).toBe('sse');
    expect(result.auth?.type).toBe('bearer');
  });

  it('should reject configs with neither command nor transport', () => {
    const invalidConfig = {
      args: ['some-args'],
      env: { VAR: 'value' },
    };

    expect(() => TargetServerWithoutNameSchema.parse(invalidConfig)).toThrow(
      "Server must have either 'command' or 'transport'",
    );
  });
});
