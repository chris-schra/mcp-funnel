/**
 * Configuration locator implementations for different CLI clients
 */

import { resolve, join } from 'path';
import { homedir } from 'os';
import { promises as fs } from 'fs';
import { parse as parseToml, stringify as stringifyToml } from 'smol-toml';
import type {
  CliId,
  ConfigScope,
  ConfigLocator,
  LocatedConfigSnapshot,
  ServerConfig,
  JsonObject,
  JsonServerExtractor,
  JsonServerUpdater,
  LocatorContext,
  JsonPath,
  JsonValue,
} from './types.js';
import {
  fileExists,
  resolveRepoPath,
  logWarnings,
  isRecord,
  sanitizeServerConfig,
  extractMcpServers,
  updateMcpServers,
  convertServersToJsonRecord,
  INDENT_SIZE,
} from './utils.js';

/**
 * JSON file locator for clients using JSON configuration files
 */
class JsonFileLocator implements ConfigLocator {
  public constructor(
    public readonly client: CliId,
    public readonly scope: ConfigScope,
    public readonly label: string,
    private readonly pathResolver: () => string,
    private readonly extractor: JsonServerExtractor,
    private readonly updater: JsonServerUpdater,
  ) {}

  public async findConfigs(): Promise<readonly LocatedConfigSnapshot[]> {
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

  public async replaceServers(
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

/**
 * TOML file locator for clients using TOML configuration files
 */
class TomlFileLocator implements ConfigLocator {
  public constructor(
    public readonly client: CliId,
    public readonly scope: ConfigScope,
    public readonly label: string,
    private readonly pathResolver: () => string,
  ) {}

  public async findConfigs(): Promise<readonly LocatedConfigSnapshot[]> {
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

  public async replaceServers(
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

/**
 * Specialized locator for Claude Desktop supporting both global and project configs
 */
class ClaudeDesktopLocator implements ConfigLocator {
  public constructor(
    public readonly label: string,
    private readonly pathResolver: () => string,
  ) {}

  public readonly client: CliId = 'claude-desktop';
  public readonly scope: ConfigScope = 'user';

  public async findConfigs(): Promise<readonly LocatedConfigSnapshot[]> {
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

  public async replaceServers(
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

const homeDirectory = homedir();

/**
 * Registry of all available configuration locators
 */
export const locators: readonly ConfigLocator[] = [
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
