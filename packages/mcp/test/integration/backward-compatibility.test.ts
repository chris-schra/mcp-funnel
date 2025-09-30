import { describe, it, expect } from 'vitest';
import {
  type ProxyConfig,
  ProxyConfigSchema,
  TargetServerSchema,
  type TargetServerZod,
} from '@mcp-funnel/schemas';

describe('Secrets Configuration Tests', () => {
  describe('Backward Compatibility Tests', () => {
    it('should support existing env field without breaking changes', () => {
      const legacyServerConfig: TargetServerZod = {
        name: 'legacy-server',
        command: 'node',
        args: ['app.js'],
        env: {
          NODE_ENV: 'production',
          API_KEY: 'legacy-key',
          DATABASE_URL: 'postgres://localhost',
        },
      };

      const result = TargetServerSchema.parse(legacyServerConfig);
      expect(result).toEqual(legacyServerConfig);
      expect(result.env).toEqual({
        NODE_ENV: 'production',
        API_KEY: 'legacy-key',
        DATABASE_URL: 'postgres://localhost',
      });
    });

    it('should support env field alongside secretProviders', () => {
      const hybridServerConfig: TargetServerZod = {
        name: 'hybrid-server',
        command: 'node',
        args: ['app.js'],
        env: {
          NODE_ENV: 'production',
          LOG_LEVEL: 'info',
        },
        secretProviders: [
          {
            type: 'dotenv',
            config: {
              path: '.env.secrets',
            },
          },
        ],
      };

      const result = TargetServerSchema.parse(hybridServerConfig);
      expect(result).toEqual(hybridServerConfig);
      expect(result.env).toBeDefined();
      expect(result.secretProviders).toBeDefined();
      expect(result.secretProviders).toHaveLength(1);
    });

    it('should maintain backward compatibility for configs without any secret providers', () => {
      const oldConfig: ProxyConfig = {
        servers: [
          {
            name: 'old-server',
            command: 'python',
            args: ['-m', 'server'],
            env: {
              PYTHONPATH: '/opt/app',
            },
          },
        ],
        alwaysVisibleTools: ['old-server__legacy_tool'],
      };

      const result = ProxyConfigSchema.parse(oldConfig);
      expect(result).toEqual(oldConfig);
      expect(result.defaultSecretProviders).toBeUndefined();
      expect(result.defaultPassthroughEnv).toBeUndefined();
    });

    it('should validate complete legacy configuration without breaking', () => {
      const fullLegacyConfig: ProxyConfig = {
        servers: [
          {
            name: 'service-a',
            command: 'npm',
            args: ['run', 'start'],
            env: {
              PORT: '3000',
              NODE_ENV: 'development',
            },
          },
          {
            name: 'service-b',
            command: 'python',
            args: ['-m', 'uvicorn', 'main:app'],
            env: {
              HOST: '0.0.0.0',
              PORT: '8000',
            },
          },
        ],
        exposeTools: ['service-a__*', 'service-b__health'],
        hideTools: ['service-*__debug'],
        alwaysVisibleTools: ['service-a__status'],
      };

      const result = ProxyConfigSchema.parse(fullLegacyConfig);
      expect(result).toEqual(fullLegacyConfig);
      expect(result.servers).toHaveLength(2);
    });
  });
});
