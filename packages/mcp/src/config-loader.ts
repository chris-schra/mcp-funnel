import { homedir } from 'os';
import { join, resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { deepmergeCustom } from 'deepmerge-ts';
import { type ProxyConfig, ProxyConfigSchema } from '@mcp-funnel/schemas';

/**
 * Reads and parses a JSON file if it exists.
 * @param path - Absolute path to JSON file
 * @returns Parsed JSON content or undefined if file doesn't exist
 * @throws \{SyntaxError\} When file contains invalid JSON
 * @internal
 */
function readJsonIfExists(path: string): unknown | undefined {
  if (!existsSync(path)) return undefined;
  const txt = readFileSync(path, 'utf-8');
  return JSON.parse(txt) as unknown;
}

/**
 * Returns the user-level configuration directory.
 *
 * Resolves to MCP_FUNNEL_HOME environment variable if set,
 * otherwise defaults to ~/.mcp-funnel
 * @returns Absolute path to user configuration directory
 * @public
 */
export function getUserDir(): string {
  const override = process.env.MCP_FUNNEL_HOME;
  if (override && override.trim()) return override;
  return join(homedir(), '.mcp-funnel');
}

/**
 * Returns the user-level configuration file path.
 * @returns Absolute path to ~/.mcp-funnel/.mcp-funnel.json (or MCP_FUNNEL_HOME override)
 * @public
 */
export function getUserBasePath(): string {
  return join(getUserDir(), '.mcp-funnel.json');
}

/**
 * Returns the default project-level configuration file path.
 * @param cwd - Working directory to resolve from (defaults to process.cwd())
 * @returns Absolute path to .mcp-funnel.json in the specified directory
 * @public
 */
export function getDefaultProjectConfigPath(cwd = process.cwd()): string {
  return resolve(cwd, '.mcp-funnel.json');
}

/**
 * Loads and merges configuration from user base and project config paths.
 *
 * Merge precedence (last wins):
 * 1. Defaults: `\{ servers: [] \}`
 * 2. User base config: ~/.mcp-funnel/.mcp-funnel.json
 * 3. Project config: .mcp-funnel.json (or explicit path)
 *
 * Merge strategy:
 * - Arrays: Replaced entirely (not concatenated)
 * - Objects: Shallow merge with last-wins per key
 * @param projectConfigPath - Optional explicit path to project config (defaults to .mcp-funnel.json in cwd)
 * @returns Merged and validated configuration with source tracking
 * @throws \{ZodError\} When merged configuration fails schema validation
 * @example
 * ```typescript
 * const { config, sources } = resolveMergedProxyConfig();
 * console.log(`Loaded from: ${sources.join(', ')}`);
 * ```
 * @public
 * @see {@link ProxyConfigSchema} - Configuration schema definition
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
    userBase && typeof userBase === 'object' ? (userBase as Record<string, unknown>) : {},
    project && typeof project === 'object' ? (project as Record<string, unknown>) : {},
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
