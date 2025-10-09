/**
 * Type definitions for the MCP server initialization system
 */

/**
 * Supported CLI client identifiers
 */
export type CliId = 'claude-code' | 'gemini' | 'codex' | 'claude-desktop';

/**
 * Configuration scope: repo-level or user-level
 */
export type ConfigScope = 'repo' | 'user';

/**
 * Server configuration interface representing an MCP server definition
 */
export interface ServerConfig {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly transport?: string;
  readonly [key: string]: unknown;
}

/**
 * Snapshot of a configuration file including metadata and parsed servers
 */
export interface ConfigSnapshot {
  readonly client: CliId;
  readonly scope: ConfigScope;
  readonly label: string;
  readonly path: string;
  readonly servers: Readonly<Record<string, ServerConfig>>;
  readonly raw: string;
  readonly projectPath?: string;
}

/**
 * Configuration snapshot with its associated locator
 */
export interface LocatedConfigSnapshot extends ConfigSnapshot {
  readonly locator: ConfigLocator;
}

/**
 * Interface for configuration file locators that discover and update configs
 */
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

/**
 * JSON primitive value types
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * JSON array type
 */
export type JsonArray = readonly JsonValue[];

/**
 * JSON value type supporting all valid JSON structures
 */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/**
 * JSON object type
 */
export type JsonObject = { readonly [key: string]: JsonValue };

/**
 * A segment in a JSON path (string key or numeric index)
 */
export type JsonPathSegment = string | number;

/**
 * A path through a JSON structure
 */
export type JsonPath = readonly JsonPathSegment[];

/**
 * Context information for locator operations
 */
export interface LocatorContext {
  readonly configPath: string;
}

/**
 * Function type for extracting MCP servers from a JSON configuration
 */
export type JsonServerExtractor = (
  root: JsonObject,
  context: LocatorContext,
) => Record<string, ServerConfig> | null;

/**
 * Result of updating servers in a JSON configuration
 */
export type ServerUpdateResult = {
  readonly nextRoot: JsonObject;
  readonly warnings: string[];
};

/**
 * Function type for updating MCP servers in a JSON configuration
 */
export type JsonServerUpdater = (
  root: JsonObject,
  next: Readonly<Record<string, ServerConfig>>,
  context: LocatorContext,
) => ServerUpdateResult;

/**
 * State of a funnel configuration file
 */
export interface FunnelConfigState {
  readonly path: string;
  readonly exists: boolean;
  readonly data: Record<string, unknown>;
  readonly servers: Record<string, ServerConfig>;
  readonly raw?: string;
}
