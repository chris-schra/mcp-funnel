import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';

/**
 * Writes JSON data to a file, creating parent directories as needed.
 * @param file - File path to write to
 * @param value - Data to serialize as JSON
 */
function writeJson(file: string, value: unknown) {
  mkdirSync(resolve(file, '..'), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

describe('config-loader two-level merge', () => {
  let originalHOME: string | undefined;
  let fakeHome: string;
  let projectDir: string;

  beforeEach(() => {
    originalHOME = process.env.HOME;
    fakeHome = mkdtempSync(join(tmpdir(), 'mcpf-home-'));
    process.env.HOME = fakeHome;
    process.env.MCP_FUNNEL_HOME = join(fakeHome, '.mcp-funnel'); // direct override used by loader
    projectDir = mkdtempSync(join(tmpdir(), 'mcpf-proj-'));
  });

  afterEach(() => {
    if (originalHOME === undefined) delete process.env.HOME;
    else process.env.HOME = originalHOME;
    delete process.env.MCP_FUNNEL_HOME;
    try {
      rmSync(fakeHome, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
    try {
      rmSync(projectDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('loads project-only config', async () => {
    const { resolveMergedProxyConfig } = await import('../../src/config-loader.js');
    const projectConfigPath = join(projectDir, '.mcp-funnel.json');
    writeJson(projectConfigPath, {
      servers: {
        memory: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-memory'],
        },
      },
    });

    const { config, sources } = resolveMergedProxyConfig(projectConfigPath);
    expect(sources).toContain(projectConfigPath);
    expect(Array.isArray(config.servers)).toBe(false);
    expect((config.servers as Record<string, unknown>).memory).toBeDefined();
  });

  it('loads user-only config', async () => {
    const { resolveMergedProxyConfig } = await import('../../src/config-loader.js');
    const userBasePath = join(fakeHome, '.mcp-funnel', '.mcp-funnel.json');
    writeJson(userBasePath, {
      servers: {
        fs: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
        },
      },
    });

    const { config, sources } = resolveMergedProxyConfig(join(projectDir, '.mcp-funnel.json'));
    expect(sources).toContain(userBasePath);
    expect(Array.isArray(config.servers)).toBe(false);
    expect((config.servers as Record<string, unknown>).fs).toBeDefined();
  });

  it('project overrides user for arrays (replace)', async () => {
    const { resolveMergedProxyConfig } = await import('../../src/config-loader.js');
    const userBasePath = join(fakeHome, '.mcp-funnel', '.mcp-funnel.json');
    writeJson(userBasePath, {
      servers: {},
      hideTools: ['a', 'b'],
    });
    const projectConfigPath = join(projectDir, '.mcp-funnel.json');
    writeJson(projectConfigPath, {
      servers: {},
      hideTools: ['c'],
    });

    const { config } = resolveMergedProxyConfig(projectConfigPath);
    expect(config.hideTools).toEqual(['c']);
  });

  it('deep merges objects across levels', async () => {
    const { resolveMergedProxyConfig } = await import('../../src/config-loader.js');
    const userBasePath = join(fakeHome, '.mcp-funnel', '.mcp-funnel.json');
    writeJson(userBasePath, { servers: {}, alwaysVisibleTools: ['tool1'] });
    const projectConfigPath = join(projectDir, '.mcp-funnel.json');
    writeJson(projectConfigPath, { servers: {}, exposeTools: ['tool2'] });

    const { config } = resolveMergedProxyConfig(projectConfigPath);
    expect(config.alwaysVisibleTools).toEqual(['tool1']);
    expect(config.exposeTools).toEqual(['tool2']);
  });

  it('project servers override user servers when both provided', async () => {
    const { resolveMergedProxyConfig } = await import('../../src/config-loader.js');
    const userBasePath = join(fakeHome, '.mcp-funnel', '.mcp-funnel.json');
    writeJson(userBasePath, {
      servers: {
        a: { command: 'echo', args: ['a'] },
      },
    });
    const projectConfigPath = join(projectDir, '.mcp-funnel.json');
    writeJson(projectConfigPath, {
      servers: {
        b: { command: 'echo', args: ['b'] },
      },
    });

    const { config } = resolveMergedProxyConfig(projectConfigPath);
    const keys = Array.isArray(config.servers)
      ? (config.servers as Array<{ name: string }>).map((s) => s.name)
      : Object.keys(config.servers as Record<string, unknown>);
    expect(keys).toContain('b');
  });
});
