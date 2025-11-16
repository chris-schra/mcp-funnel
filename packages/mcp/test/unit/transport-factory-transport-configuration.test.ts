import { describe, it, expect } from 'vitest';

import type { SSETransportConfig, TransportConfig } from '@mcp-funnel/models';
import { createTransport } from '../../src/utils/transport/index.js';

describe('TransportFactory - Transport Configuration', () => {
  it('should apply default timeout for SSE transport', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
    };

    const transport = await createTransport(config);

    expect((transport.config as SSETransportConfig).timeout).toBe(30000); // default timeout
  });

  it('should apply custom timeout for SSE transport', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
      timeout: 60000,
    };

    const transport = await createTransport(config);

    expect((transport.config as SSETransportConfig).timeout).toBe(60000);
  });

  it('should apply default reconnect settings for SSE transport', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
    };

    const transport = await createTransport(config);

    expect((transport.config as SSETransportConfig).reconnect?.maxAttempts).toBe(3);
    expect((transport.config as SSETransportConfig).reconnect?.initialDelayMs).toBe(1000);
    expect((transport.config as SSETransportConfig).reconnect?.maxDelayMs).toBe(30000);
    expect((transport.config as SSETransportConfig).reconnect?.backoffMultiplier).toBe(2);
  });

  it('should merge custom reconnect settings with defaults', async () => {
    const config: TransportConfig = {
      type: 'sse',
      url: 'https://api.example.com/events',
      reconnect: {
        maxAttempts: 5, // custom
        // other fields should use defaults
      },
    };

    const transport = await createTransport(config);

    expect((transport.config as SSETransportConfig).reconnect?.maxAttempts).toBe(5);
    expect((transport.config as SSETransportConfig).reconnect?.initialDelayMs).toBe(1000); // default
  });
});
