import { describe, it, expect } from 'vitest';
import type { ProxyConfig } from '@mcp-funnel/schemas';
import { LoadToolset } from '../index.js';

describe('LoadToolset', () => {
  describe('isEnabled', () => {
    it('should be enabled when exposeCoreTools is not specified', () => {
      const loadToolset = new LoadToolset();
      const config: ProxyConfig = {
        servers: [],
      };
      expect(loadToolset.isEnabled(config)).toBe(true);
    });

    it('should be disabled when exposeCoreTools is empty array', () => {
      const loadToolset = new LoadToolset();
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: [],
      };
      expect(loadToolset.isEnabled(config)).toBe(false);
    });

    it('should be enabled when exposeCoreTools includes tool name', () => {
      const loadToolset = new LoadToolset();
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['load_toolset'],
      };
      expect(loadToolset.isEnabled(config)).toBe(true);
    });

    it('should be enabled when exposeCoreTools has matching pattern', () => {
      const loadToolset = new LoadToolset();
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['load_*'],
      };
      expect(loadToolset.isEnabled(config)).toBe(true);
    });

    it('should be enabled when exposeCoreTools is ["*"]', () => {
      const loadToolset = new LoadToolset();
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['*'],
      };
      expect(loadToolset.isEnabled(config)).toBe(true);
    });

    it('should be disabled when exposeCoreTools excludes the tool', () => {
      const loadToolset = new LoadToolset();
      const config: ProxyConfig = {
        servers: [],
        exposeCoreTools: ['other_tool'],
      };
      expect(loadToolset.isEnabled(config)).toBe(false);
    });
  });
});
