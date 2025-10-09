import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import type { ServerConfig } from './init/types.js';

// Mock fs module for backup tests
vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
    copyFile: vi.fn(),
  },
}));

// Import the functions to be tested from their respective modules
import { isMcpFunnelReference } from './init/detection.js';
import { detectSensitiveKeys } from './init/env-detection.js';
import { createBackup } from './init/backup.js';

describe('isMcpFunnelReference', () => {
  it.each([
    // Should detect
    ['mcp-funnel', { command: 'npx', args: ['-y', 'mcp-funnel'] }, true],
    ['funnel', { command: 'tsx', args: ['./packages/mcp/src/cli.ts'] }, true],
    ['proxy', { command: 'npx', args: ['mcp-funnel', 'config.json'] }, true],
    ['dev', { command: 'tsx', args: ['/path/to/mcp-funnel/cli.ts'] }, true],
    ['local', { command: 'node', args: ['mcp-funnel/dist/cli.js'] }, true],

    // Should NOT detect
    ['github', { command: 'npx', args: ['@modelcontextprotocol/server-github'] }, false],
    ['weather', { command: 'node', args: ['weather.js'] }, false],
  ])('detects %s correctly', (name, config, expected) => {
    expect(isMcpFunnelReference(name, config as ServerConfig)).toBe(expected);
  });
});

describe('detectSensitiveKeys', () => {
  it('detects common sensitive patterns', () => {
    const env = {
      GITHUB_TOKEN: 'xxx',
      API_SECRET: 'yyy',
      NORMAL_VAR: 'zzz',
      DATABASE_PASSWORD: 'aaa',
    };

    const sensitive = detectSensitiveKeys(env);
    expect(sensitive).toContain('GITHUB_TOKEN');
    expect(sensitive).toContain('API_SECRET');
    expect(sensitive).toContain('DATABASE_PASSWORD');
    expect(sensitive).not.toContain('NORMAL_VAR');
  });

  it('handles undefined env', () => {
    expect(detectSensitiveKeys(undefined)).toEqual([]);
  });

  it('handles empty env object', () => {
    expect(detectSensitiveKeys({})).toEqual([]);
  });
});

describe('createBackup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates timestamp-based backup', async () => {
    const testFile = '/tmp/test.json';
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.copyFile).mockResolvedValue(undefined);

    const before = Date.now();
    const backupPath = await createBackup(testFile);
    const after = Date.now();

    expect(backupPath).toMatch(/\.backup\.\d+$/);

    const timestamp = parseInt(backupPath!.split('.').pop()!);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);

    expect(fs.copyFile).toHaveBeenCalledWith(testFile, backupPath);
  });

  it('returns null for non-existent files', async () => {
    const error = new Error('File not found') as NodeJS.ErrnoException;
    error.code = 'ENOENT';
    vi.mocked(fs.access).mockRejectedValue(error);

    const result = await createBackup('/tmp/does-not-exist.json');
    expect(result).toBeNull();
    expect(fs.copyFile).not.toHaveBeenCalled();
  });

  it('handles file copy errors gracefully', async () => {
    const testFile = '/tmp/test.json';
    vi.mocked(fs.access).mockResolvedValue(undefined);
    vi.mocked(fs.copyFile).mockRejectedValue(new Error('Permission denied'));

    await expect(createBackup(testFile)).rejects.toThrow('Permission denied');
  });
});
