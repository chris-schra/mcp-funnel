import { resolve, join } from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import { createBackup } from './init/backup.js';
import {
  isMcpFunnelReference,
  aggregateServers as aggregateServersWithFiltering,
} from './init/detection.js';
import { analyzeConfigs, determineTargetPath } from './init/config-location.js';
import { mergeServersIntoFunnel as mergeServersWithConflicts } from './init/conflicts.js';
import { selectServerConfigs } from './init/selection.js';
import { deepClone } from '../utils/clone.js';
import { toJsonValue } from '../utils/json.js';

export type CliId = 'claude-code' | 'gemini' | 'codex' | 'claude-desktop';
export type ConfigScope = 'repo' | 'user';

export interface ServerConfig {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly transport?: string;
  readonly [key: string]: unknown;
}

export interface ConfigSnapshot {
  readonly client: CliId;
  readonly scope: ConfigScope;
  readonly label: string;
  readonly path: string;
  readonly servers: Readonly<Record<string, ServerConfig>>;
  readonly raw: string;
  readonly projectPath?: string;
}

export interface LocatedConfigSnapshot extends ConfigSnapshot {
  readonly locator: ConfigLocator;
}

export interface ConfigLocator {
  readonly client: CliId;
  readonly scope: ConfigScope;
  readonly label: string;
  findConfigs(): Promise<readonly LocatedConfigSnapshot[]>;
  replaceServers(
    snapshot: LocatedConfigSnapshot,
    nextServers: Readonly<Record<string, ServerConfig>>,
  ): Promise<void>;
}

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { readonly [key: string]: JsonValue };

type JsonObject = { readonly [key: string]: JsonValue };

type JsonPathSegment = string | number;
type JsonPath = readonly JsonPathSegment[];

type JsonServerExtractor = (
  root: JsonObject,
  context: LocatorContext,
) => Record<string, ServerConfig> | null;

type JsonServerUpdater = (
  root: JsonObject,
  next: Readonly<Record<string, ServerConfig>>,
  context: LocatorContext,
) => { readonly nextRoot: JsonObject; readonly warnings: string[] };

interface LocatorContext {
  readonly configPath: string;
}

const INDENT_SIZE = 2;

/**
 *
 * @param path
 */
function formatJsonPath(path: JsonPath): string {
  if (path.length === 0) {
    return '(root)';
  }

  return path
    .map((segment) =>
      typeof segment === 'number'
        ? `[${segment}]`
        : segment.includes('.')
          ? `['${segment}']`
          : segment,
    )
    .join('.');
}

/**
 *
 * @param servers
 * @param warnings
 * @param contextPath
 */
function convertServersToJsonRecord(
  servers: Readonly<Record<string, ServerConfig>>,
  warnings: string[],
  contextPath: JsonPath,
): Record<string, JsonValue> {
  const record: Record<string, JsonValue> = {};
  for (const [name, config] of Object.entries(servers)) {
    const pathString = formatJsonPath([...contextPath, name]);
    const converted = toJsonValue(config, warnings, pathString);
    if (converted !== undefined) {
      record[name] = converted as JsonValue;
    }
  }
  return record;
}

/**
 *
 * @param warnings
 */
function logWarnings(warnings: readonly string[]): void {
  warnings.forEach((warning) => {
    console.warn(`[mcp-funnel:init] ${warning}`);
  });
}

/**
 *
 * @param value
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 *
 * @param value
 */
function sanitizeServerConfig(value: unknown): ServerConfig | null {
  if (!isRecord(value)) {
    return null;
  }

  const { command } = value;
  if (typeof command !== 'string' || command.trim().length === 0) {
    return null;
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    sanitized[key] = entry;
  }

  if ('args' in sanitized) {
    const argsValue = sanitized.args;
    if (!Array.isArray(argsValue) || !argsValue.every((item) => typeof item === 'string')) {
      delete sanitized.args;
    } else {
      sanitized.args = [...argsValue];
    }
  }

  if ('env' in sanitized) {
    const envValue = sanitized.env;
    if (
      !isRecord(envValue) ||
      !Object.values(envValue).every((entry) => typeof entry === 'string')
    ) {
      delete sanitized.env;
    } else {
      const envCopy: Record<string, string> = {};
      for (const [key, entry] of Object.entries(envValue)) {
        if (typeof entry === 'string') {
          envCopy[key] = entry;
        }
      }
      sanitized.env = envCopy;
    }
  }

  sanitized.command = command;
  return sanitized as ServerConfig;
}

/**
 *
 * @param node
 */
function extractMcpServers(node: unknown): Record<string, ServerConfig> | null {
  if (!isRecord(node)) {
    return null;
  }

  const rawServers = node.mcpServers;
  if (!isRecord(rawServers)) {
    return null;
  }

  const servers: Record<string, ServerConfig> = {};
  for (const [name, descriptor] of Object.entries(rawServers)) {
    const config = sanitizeServerConfig(descriptor);
    if (config) {
      servers[name] = config;
    }
  }

  return servers;
}

/**
 *
 * @param root
 * @param next
 * @param context
 */
function updateMcpServers(
  root: JsonObject,
  next: Readonly<Record<string, ServerConfig>>,
  context: LocatorContext,
): { readonly nextRoot: JsonObject; readonly warnings: string[] } {
  const clone: Record<string, JsonValue> = { ...root };
  const warnings: string[] = [];
  clone.mcpServers = convertServersToJsonRecord(next, warnings, [context.configPath, 'mcpServers']);
  return { nextRoot: clone, warnings };
}

class JsonFileLocator implements ConfigLocator {
  constructor(
    public readonly client: CliId,
    public readonly scope: ConfigScope,
    public readonly label: string,
    private readonly pathResolver: () => string,
    private readonly extractor: JsonServerExtractor,
    private readonly updater: JsonServerUpdater,
  ) {}

  async findConfigs(): Promise<readonly LocatedConfigSnapshot[]> {
    const configPath = this.pathResolver();
    if (!configPath) {
      return [];
    }

    if (!(await fileExists(configPath))) {
      return [];
    }

    const raw = await fs.readFile(configPath, 'utf8');
    let parsed: JsonObject;
    try {
      parsed = JSON.parse(raw) as JsonObject;
    } catch (error) {
      console.error(`Failed to parse JSON at ${configPath}:`, error);
      return [];
    }

    const context: LocatorContext = { configPath };
    const servers = this.extractor(parsed, context) ?? {};

    return [
      {
        client: this.client,
        scope: this.scope,
        label: this.label,
        path: configPath,
        servers,
        raw,
        locator: this,
      },
    ];
  }

  async replaceServers(
    snapshot: LocatedConfigSnapshot,
    nextServers: Readonly<Record<string, ServerConfig>>,
  ): Promise<void> {
    const raw = await fs.readFile(snapshot.path, 'utf8');
    const parsed = JSON.parse(raw) as JsonObject;
    const context: LocatorContext = { configPath: snapshot.path };
    const { nextRoot, warnings } = this.updater(parsed, nextServers, context);
    if (warnings.length > 0) {
      logWarnings(warnings);
    }
    const serialized = `${JSON.stringify(nextRoot, null, INDENT_SIZE)}\n`;
    await fs.writeFile(snapshot.path, serialized, 'utf8');
  }
}

class TomlFileLocator implements ConfigLocator {
  constructor(
    public readonly client: CliId,
    public readonly scope: ConfigScope,
    public readonly label: string,
    private readonly pathResolver: () => string,
  ) {}

  async findConfigs(): Promise<readonly LocatedConfigSnapshot[]> {
    const configPath = this.pathResolver();
    if (!configPath) {
      return [];
    }

    if (!(await fileExists(configPath))) {
      return [];
    }

    const raw = await fs.readFile(configPath, 'utf8');
    let parsed: unknown;
    try {
      parsed = parseToml(raw);
    } catch (error) {
      console.error(`Failed to parse TOML at ${configPath}:`, error);
      return [];
    }

    if (!isRecord(parsed)) {
      return [];
    }

    const servers: Record<string, ServerConfig> = {};
    if (isRecord(parsed.mcp_servers)) {
      for (const [name, descriptor] of Object.entries(parsed.mcp_servers)) {
        const config = sanitizeServerConfig(descriptor);
        if (config) {
          servers[name] = config;
        }
      }
    }

    return [
      {
        client: this.client,
        scope: this.scope,
        label: this.label,
        path: configPath,
        servers,
        raw,
        locator: this,
      },
    ];
  }

  async replaceServers(
    snapshot: LocatedConfigSnapshot,
    nextServers: Readonly<Record<string, ServerConfig>>,
  ): Promise<void> {
    const raw = await fs.readFile(snapshot.path, 'utf8');
    const parsed = parseToml(raw);
    if (!isRecord(parsed)) {
      throw new Error(`Unexpected TOML shape at ${snapshot.path}`);
    }

    const nextRoot: Record<string, unknown> = { ...parsed };
    const next: Record<string, unknown> = {};
    for (const [name, server] of Object.entries(nextServers)) {
      next[name] = server;
    }

    nextRoot.mcp_servers = next;
    const serialized = `${stringifyToml(nextRoot)}\n`;
    await fs.writeFile(snapshot.path, serialized, 'utf8');
  }
}

class ClaudeDesktopLocator implements ConfigLocator {
  constructor(
    public readonly label: string,
    private readonly pathResolver: () => string,
  ) {}

  public readonly client: CliId = 'claude-desktop';
  public readonly scope: ConfigScope = 'user';

  async findConfigs(): Promise<readonly LocatedConfigSnapshot[]> {
    const configPath = this.pathResolver();
    if (!configPath || !(await fileExists(configPath))) {
      return [];
    }

    const raw = await fs.readFile(configPath, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as JsonObject;
    } catch (error) {
      console.error(`Failed to parse JSON at ${configPath}:`, error);
      return [];
    }

    if (!isRecord(parsed)) {
      return [];
    }

    const snapshots: LocatedConfigSnapshot[] = [];

    const globalServers = extractMcpServers(parsed) ?? {};
    snapshots.push({
      client: this.client,
      scope: 'user',
      label: `${this.label} (global)`,
      path: configPath,
      servers: globalServers,
      raw,
      locator: this,
    });

    if (isRecord(parsed.projects)) {
      for (const [projectPath, descriptor] of Object.entries(parsed.projects)) {
        if (!isRecord(descriptor)) {
          continue;
        }
        const projectServers = extractMcpServers(descriptor);
        if (!projectServers || Object.keys(projectServers).length === 0) {
          continue;
        }

        snapshots.push({
          client: this.client,
          scope: 'repo',
          label: `${this.label} (project: ${projectPath})`,
          path: configPath,
          servers: projectServers,
          raw,
          locator: this,
          projectPath,
        });
      }
    }

    return snapshots;
  }

  async replaceServers(
    snapshot: LocatedConfigSnapshot,
    nextServers: Readonly<Record<string, ServerConfig>>,
  ): Promise<void> {
    const raw = await fs.readFile(snapshot.path, 'utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as JsonObject;
    } catch (error) {
      throw new Error(
        `Failed to parse JSON at ${snapshot.path}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (!isRecord(parsed)) {
      throw new Error(`Unexpected JSON structure at ${snapshot.path}`);
    }

    const nextRoot: Record<string, JsonValue> = {
      ...(parsed as Record<string, JsonValue>),
    };
    const warnings: string[] = [];
    const basePath: JsonPath = snapshot.projectPath
      ? ['projects', snapshot.projectPath, 'mcpServers']
      : ['mcpServers'];
    const sanitized = convertServersToJsonRecord(nextServers, warnings, basePath);

    if (snapshot.projectPath) {
      const existingProjectsValue = isRecord(nextRoot.projects)
        ? (nextRoot.projects as Record<string, JsonValue>)
        : {};
      const projects = { ...existingProjectsValue } as Record<string, JsonValue>;
      const projectEntryRaw = isRecord(projects[snapshot.projectPath])
        ? (projects[snapshot.projectPath] as Record<string, JsonValue>)
        : {};
      const projectEntry: Record<string, JsonValue> = { ...projectEntryRaw };
      projectEntry.mcpServers = sanitized;
      projects[snapshot.projectPath] = projectEntry;
      nextRoot.projects = projects;
    } else {
      nextRoot.mcpServers = sanitized;
    }

    if (warnings.length > 0) {
      logWarnings(warnings);
    }

    const serialized = `${JSON.stringify(nextRoot, null, INDENT_SIZE)}\n`;
    await fs.writeFile(snapshot.path, serialized, 'utf8');
  }
}
/**
 *
 * @param path
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 *
 * @param relativePath
 */
function resolveRepoPath(relativePath: string): string {
  return resolve(process.cwd(), relativePath);
}

const homeDirectory = os.homedir();

const locators: readonly ConfigLocator[] = [
  new JsonFileLocator(
    'claude-code',
    'repo',
    'Claude Code (.mcp.json)',
    () => resolveRepoPath('.mcp.json'),
    (root) => extractMcpServers(root),
    (root, next, context) => updateMcpServers(root, next, context),
  ),
  new JsonFileLocator(
    'gemini',
    'repo',
    'Gemini CLI (.gemini/settings.json)',
    () => resolveRepoPath(join('.gemini', 'settings.json')),
    (root) => extractMcpServers(root),
    (root, next, context) => updateMcpServers(root, next, context),
  ),
  new ClaudeDesktopLocator('Claude Desktop', () => resolve(homeDirectory, '.claude.json')),
  new TomlFileLocator('codex', 'user', 'Codex CLI (~/.codex/config.toml)', () =>
    resolve(homeDirectory, '.codex', 'config.toml'),
  ),
];

// Moved to detection.ts

/**
 *
 * @param config
 */
function formatServerConfig(config: ServerConfig): string {
  const args = Array.isArray(config.args) ? config.args.join(' ') : '';
  if (args.length > 0) {
    return `${config.command} ${args}`;
  }
  return config.command;
}

/**
 *
 * @param config
 */
function cloneServerConfig(config: ServerConfig): ServerConfig {
  return deepClone(config);
}

/**
 *
 */
function createDefaultFunnelConfig(): Record<string, unknown> {
  return {
    servers: {},
    exposeCoreTools: [
      'discover_tools_by_words',
      'get_tool_schema',
      'load_toolset',
      'bridge_tool_request',
    ],
  };
}

export interface FunnelConfigState {
  readonly path: string;
  readonly exists: boolean;
  readonly data: Record<string, unknown>;
  readonly servers: Record<string, ServerConfig>;
  readonly raw?: string;
}

/**
 *
 * @param value
 */
function parseFunnelServers(value: unknown): Record<string, ServerConfig> {
  const servers: Record<string, ServerConfig> = {};

  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!isRecord(entry)) {
        continue;
      }
      const { name, ...rest } = entry as Record<string, unknown>;
      if (typeof name !== 'string') {
        continue;
      }
      const config = sanitizeServerConfig(rest);
      if (config) {
        servers[name] = config;
      }
    }
    return servers;
  }

  if (!isRecord(value)) {
    return servers;
  }

  for (const [name, descriptor] of Object.entries(value)) {
    const config = sanitizeServerConfig(descriptor);
    if (config) {
      servers[name] = config;
    }
  }

  return servers;
}

/**
 *
 * @param servers
 */
function orderRecord(
  servers: Readonly<Record<string, ServerConfig>>,
): Record<string, ServerConfig> {
  const ordered: Record<string, ServerConfig> = {};
  const entries = Object.entries(servers).sort((a, b) => a[0].localeCompare(b[0]));
  for (const [name, config] of entries) {
    ordered[name] = cloneServerConfig(config);
  }
  return ordered;
}

/**
 *
 * @param path
 */
async function loadFunnelConfig(path: string): Promise<FunnelConfigState> {
  if (!(await fileExists(path))) {
    return {
      path,
      exists: false,
      data: createDefaultFunnelConfig(),
      servers: {},
      raw: '{}',
    };
  }

  const raw = await fs.readFile(path, 'utf8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Failed to parse ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(`Configuration at ${path} is not a JSON object.`);
  }

  const servers = parseFunnelServers(parsed.servers);
  const data = { ...parsed } as Record<string, unknown>;
  data.servers = orderRecord(servers);

  return {
    path,
    exists: true,
    data,
    servers,
    raw,
  };
}

/**
 *
 * @param path
 * @param servers
 * @param existingData
 */
async function writeFunnelConfig(
  path: string,
  servers: Readonly<Record<string, ServerConfig>>,
  existingData?: Record<string, unknown>,
): Promise<void> {
  const data = existingData || createDefaultFunnelConfig();
  const nextData = { ...data, servers: orderRecord(servers) };
  const serialized = `${JSON.stringify(nextData, null, INDENT_SIZE)}\n`;
  await fs.writeFile(path, serialized, 'utf8');
}

// Moved to conflicts.ts

/**
 *
 */
async function discoverAllConfigs(): Promise<LocatedConfigSnapshot[]> {
  const snapshots: LocatedConfigSnapshot[] = [];
  for (const locator of locators) {
    try {
      const results = await locator.findConfigs();
      for (const snapshot of results) {
        snapshots.push(snapshot);
      }
    } catch (error) {
      console.error(`Failed to inspect ${locator.label}:`, error);
    }
  }
  return snapshots;
}

/**
 *
 */
export async function runInit(): Promise<void> {
  console.info('🔍 Gathering MCP server configurations...');

  // 1. Discovery
  const snapshots = await discoverAllConfigs();

  if (snapshots.length === 0) {
    console.info('No existing MCP server configurations were found.');
    return;
  }

  console.info('\nDiscovered configurations:');
  for (const snapshot of snapshots) {
    const serverNames = Object.keys(snapshot.servers);
    console.info(`• ${snapshot.label} [${snapshot.path}]`);
    if (serverNames.length === 0) {
      console.info('  (no servers)');
      continue;
    }

    for (const serverName of serverNames) {
      const config = snapshot.servers[serverName];
      console.info(`  - ${serverName}: ${formatServerConfig(config)}`);
    }
  }

  // 2. Aggregation with filtering
  const aggregated = aggregateServersWithFiltering(snapshots);
  if (aggregated.length === 0) {
    console.info('✅ All configurations already use mcp-funnel. Nothing to migrate.');
    return;
  }

  // 3. Show what was found
  console.info('\nFound servers to migrate:');
  for (const entry of aggregated) {
    const sources = entry.occurrences.map((o) => o.snapshot.label).join(', ');
    console.info(`  • ${entry.name} (from ${sources})`);
  }

  const rl = readline.createInterface({ input, output });

  try {
    // 4. Determine target location
    const analysis = await analyzeConfigs();
    const targetPath = await determineTargetPath(analysis, rl);

    // 5. Load existing funnel config if it exists
    let funnelState: FunnelConfigState;
    if (await fileExists(targetPath)) {
      funnelState = await loadFunnelConfig(targetPath);
    } else {
      funnelState = {
        path: targetPath,
        exists: false,
        servers: {},
        data: createDefaultFunnelConfig(),
        raw: '{}',
      };
    }

    // 6. Select servers - prompt user when multiple configurations exist
    console.info('\nSelecting server configurations...');
    const selections = await selectServerConfigs(aggregated, rl);

    if (Object.keys(selections).length === 0) {
      console.info('\nNo servers selected. Exiting.');
      return;
    }

    // 7. Merge with conflict resolution
    const mergeResult = await mergeServersWithConflicts(rl, funnelState, selections);
    if (mergeResult.added.length === 0 && mergeResult.replaced.length === 0) {
      console.info('\nNo new servers to add. Exiting.');
      return;
    }

    // 8. Create backup before writing
    if (funnelState.exists) {
      await createBackup(targetPath);
    }

    // 9. Write the merged config
    await writeFunnelConfig(targetPath, mergeResult.merged, funnelState.data);
    console.info(`\n✅ Updated ${targetPath}`);

    // 10. Summary
    if (mergeResult.added.length > 0) {
      console.info(`  Added: ${mergeResult.added.join(', ')}`);
    }
    if (mergeResult.replaced.length > 0) {
      console.info(`  Replaced: ${mergeResult.replaced.join(', ')}`);
    }

    if (mergeResult.skipped.length > 0) {
      console.info(`  Skipped: ${mergeResult.skipped.join(', ')}`);
    }

    // 11. Update client configs to point to mcp-funnel
    const updatedConfigs: string[] = [];
    for (const snapshot of snapshots) {
      const needsUpdate = Object.keys(snapshot.servers).some(
        (name) => !isMcpFunnelReference(name, snapshot.servers[name]),
      );

      if (!needsUpdate) continue;

      // Create backup
      await createBackup(snapshot.path);

      // Replace servers with just mcp-funnel reference
      const mcpFunnelServer: ServerConfig = {
        command: 'npx',
        args: ['-y', 'mcp-funnel', targetPath],
      };

      await snapshot.locator.replaceServers(snapshot, {
        'mcp-funnel': mcpFunnelServer,
      });

      updatedConfigs.push(snapshot.label);
    }

    if (updatedConfigs.length > 0) {
      console.info(`\nUpdated client configs: ${updatedConfigs.join(', ')}`);
    }

    console.info('\n✅ Migration complete!');
  } finally {
    await rl.close();
  }
}

export const configLocators = locators;
