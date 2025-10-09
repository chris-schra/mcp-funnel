import { describe, it, expect } from 'vitest';
import { validateTransportConfig } from '../validateTransportConfig.js';
import type { StdioTransportConfig } from '@mcp-funnel/models';

describe('validateTransportConfig - stdio transport', () => {
  it('should accept valid stdio config with command', () => {
    const config: StdioTransportConfig = {
      type: 'stdio',
      command: 'node',
    };

    expect(() => validateTransportConfig(config)).not.toThrow();
  });

  it('should accept valid stdio config with command, args, and env', () => {
    const config: StdioTransportConfig = {
      type: 'stdio',
      command: 'node',
      args: ['index.js', '--port=3000'],
      env: { NODE_ENV: 'production' },
    };

    expect(() => validateTransportConfig(config)).not.toThrow();
  });

  it('should throw when command is missing', () => {
    const config = {
      type: 'stdio',
    } as StdioTransportConfig;

    expect(() => validateTransportConfig(config)).toThrow(
      'Command is required for stdio transport',
    );
  });

  it('should throw when command is empty string', () => {
    const config: StdioTransportConfig = {
      type: 'stdio',
      command: '',
    };

    expect(() => validateTransportConfig(config)).toThrow(
      'Command is required for stdio transport',
    );
  });
});
