import { homedir } from 'os';
import { join, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { deepmergeCustom } from 'deepmerge-ts';
import { type ProxyConfig, ProxyConfigSchema } from '@mcp-funnel/schemas';

function readJsonIfExists(path: string): unknown | undefined {
  if (!existsSync(path)) return undefined;
  const txt = readFileSync(path, 'utf-8');
  return JSON.parse(txt) as unknown;
}

export function getUserDir(): string {
  const override = process.env.MCP_FUNNEL_HOME;
  if (override && override.trim()) return override;
  return join(homedir(), '.mcp-funnel');
}

export function getUserBasePath(): string {
  return join(getUserDir(), '.mcp-funnel.json');
}

export function getDefaultProjectConfigPath(cwd = process.cwd()): string {
  return resolve(cwd, '.mcp-funnel.json');
}

/**
 * Load and merge configuration from user base and project config paths.
 * Precedence: defaults < user base < project.
 * Arrays are replaced (not concatenated).
 */
export function resolveMergedProxyConfig(projectConfigPath?: string): {
  config: ProxyConfig;
  sources: string[];
  paths: { userBasePath: string; projectConfigPath: string };
} {
  const userBasePath = getUserBasePath();
  const projectPath = projectConfigPath ?? getDefaultProjectConfigPath();

  const userBase = readJsonIfExists(userBasePath);
  const project = readJsonIfExists(projectPath);

  const merge = deepmergeCustom<Record<string, unknown>>({
    mergeArrays: (values) => values[values.length - 1],
    mergeRecords: (values, _utils) => {
      // Shallow key union with last-wins per key
      return Object.assign({}, ...values);
    },
  });

  const merged = merge(
    { servers: [] },
    userBase && typeof userBase === 'object'
      ? (userBase as Record<string, unknown>)
      : {},
    project && typeof project === 'object'
      ? (project as Record<string, unknown>)
      : {},
  );

  const validated = ProxyConfigSchema.parse(merged);

  const sources: string[] = [];
  if (userBase !== undefined) sources.push(userBasePath);
  if (project !== undefined) sources.push(projectPath);

  return {
    config: validated,
    sources,
    paths: { userBasePath, projectConfigPath: projectPath },
  };
}
