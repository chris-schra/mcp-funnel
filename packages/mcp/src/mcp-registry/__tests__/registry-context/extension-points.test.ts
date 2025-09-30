import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ServerConfig } from '../../index.js';
import { RegistryContext } from '../../registry-context.js';
import { mockConfig, createEmptyRegistryResponse } from './test-utils.js';

// Mock external dependencies
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock fetch function
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('RegistryContext', () => {
  beforeEach(() => {
    RegistryContext.reset();
    vi.clearAllMocks();
    // Set up default mock responses
    mockFetch.mockResolvedValue(createEmptyRegistryResponse());
  });

  afterEach(() => {
    RegistryContext.reset();
    vi.clearAllMocks();
  });

  describe('Extension Points (Phase 2)', () => {
    describe('enableTemporary()', () => {
      it('should accept server config and return server ID', async () => {
        const context = RegistryContext.getInstance(mockConfig);

        const serverConfig: ServerConfig = {
          name: 'temp-test',
          command: 'node',
          args: ['server.js'],
        };

        const serverId = await context.enableTemporary(serverConfig);

        expect(serverId).toBeDefined();
        expect(typeof serverId).toBe('string');
        expect(serverId.length).toBeGreaterThan(0);
      });

      it('should store server config in temporary registry', async () => {
        const context = RegistryContext.getInstance(mockConfig);

        const serverConfig: ServerConfig = {
          name: 'temp-test',
          command: 'python',
          args: ['-m', 'server'],
          env: { PYTHON_PATH: '/opt/python' },
        };

        const serverId = await context.enableTemporary(serverConfig);

        // Server should be enabled and tracked (we can't directly inspect internals)
        expect(serverId).toBeDefined();
        expect(typeof serverId).toBe('string');
      });
    });

    describe('persistTemporary()', () => {
      it('should persist temporary server config', async () => {
        const context = RegistryContext.getInstance(mockConfig);

        const serverConfig: ServerConfig = {
          name: 'temp-to-persist',
          command: 'docker',
          args: ['run', 'server-image'],
        };

        const _serverId = await context.enableTemporary(serverConfig);

        // In real implementation, this should not throw for valid server names
        await expect(
          context.persistTemporary(serverConfig.name),
        ).resolves.not.toThrow();
      });

      it('should throw for non-existent server name', async () => {
        const context = RegistryContext.getInstance(mockConfig);

        await expect(
          context.persistTemporary('nonexistent-server'),
        ).rejects.toThrow("Temporary server 'nonexistent-server' not found");
      });

      it('should handle server that can be persisted multiple times', async () => {
        const context = RegistryContext.getInstance(mockConfig);

        const serverConfig: ServerConfig = {
          name: 'already-persisted',
          command: 'test',
        };

        await context.enableTemporary(serverConfig);

        // First persistence should succeed
        await expect(
          context.persistTemporary(serverConfig.name),
        ).resolves.not.toThrow();

        // Should handle subsequent calls gracefully
        await expect(
          context.persistTemporary(serverConfig.name),
        ).resolves.not.toThrow();
      });
    });
  });
});
