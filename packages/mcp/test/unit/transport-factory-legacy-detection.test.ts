import { describe, it, expect } from 'vitest';

import { createTransport } from '../../src/utils/transport/index.js';

// Type definitions for testing

type InvalidConfig = {
  type?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  timeout?: number;
  reconnect?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  };
} & Record<string, unknown>;

describe('TransportFactory - Legacy Detection', () => {
  it('should detect legacy stdio config with command field', async () => {
    const legacyConfig = {
      command: 'node',
      args: ['--version'],
    };

    const transport = await createTransport(legacyConfig);

    expect(transport).toBeDefined();
    expect(transport.type).toBe('stdio');
  });

  it('should prefer explicit type over legacy detection', async () => {
    const config: InvalidConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
      command: 'node', // legacy field should be ignored
    };

    const transport = await createTransport(config);

    expect(transport.type).toBe('sse');
  });

  it('should handle missing command in legacy config', async () => {
    const legacyConfig = {
      args: ['--version'],
      // missing command field
    };

    await expect(createTransport(legacyConfig)).rejects.toThrow(
      'Invalid configuration: must specify either type or command field',
    );
  });
});
