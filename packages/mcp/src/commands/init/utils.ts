/**
 * Pure utility functions for MCP server initialization
 */

import { resolve } from 'path';
import { promises as fs } from 'fs';
import { deepClone } from '../../utils/clone.js';
import { toJsonValue } from '../../utils/json.js';
import type {
  JsonPath,
  JsonValue,
  JsonObject,
  ServerConfig,
  LocatorContext,
  ServerUpdateResult,
} from './types.js';

const INDENT_SIZE = 2;

/**
 * Formats a JSON path array into a human-readable string representation.
 *
 * @param path - The JSON path segments to format
 * @returns A formatted string representation of the path
 */
export function formatJsonPath(path: JsonPath): string {
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
 * Converts server configurations to a JSON-compatible record format.
 *
 * @param servers - The server configurations to convert
 * @param warnings - Array to collect warnings during conversion
 * @param contextPath - The JSON path context for error messages
 * @returns A record of JSON-compatible values
 */
export function convertServersToJsonRecord(
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
 * Logs warnings to the console with a standard prefix.
 *
 * @param warnings - Array of warning messages to log
 * @returns void
 */
export function logWarnings(warnings: readonly string[]): void {
  warnings.forEach((warning) => {
    console.warn(`[mcp-funnel:init] ${warning}`);
  });
}

/**
 * Type guard to check if a value is a plain object record.
 *
 * @param value - The value to check
 * @returns True if the value is a non-null object and not an array
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates and sanitizes a server configuration object.
 *
 * @param value - The value to sanitize
 * @returns A valid ServerConfig or null if invalid
 */
export function sanitizeServerConfig(value: unknown): ServerConfig | null {
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
 * Extracts MCP server configurations from a configuration node.
 *
 * @param node - The configuration node to extract servers from
 * @returns A record of server configurations or null if not found
 */
export function extractMcpServers(node: unknown): Record<string, ServerConfig> | null {
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
 * Updates the mcpServers property in a JSON configuration object.
 *
 * @param root - The root JSON object to update
 * @param next - The new server configurations to apply
 * @param context - Context information including the config path
 * @returns An object containing the updated root and any warnings
 */
export function updateMcpServers(
  root: JsonObject,
  next: Readonly<Record<string, ServerConfig>>,
  context: LocatorContext,
): ServerUpdateResult {
  const clone: Record<string, JsonValue> = { ...root };
  const warnings: string[] = [];
  clone.mcpServers = convertServersToJsonRecord(next, warnings, [context.configPath, 'mcpServers']);
  return { nextRoot: clone, warnings };
}

/**
 * Checks if a file exists at the specified path.
 *
 * @param path - The file path to check
 * @returns A promise that resolves to true if the file exists, false otherwise
 */
export async function fileExists(path: string): Promise<boolean> {
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
 * Resolves a relative path within the current repository.
 *
 * @param relativePath - The relative path to resolve
 * @returns The absolute resolved path
 */
export function resolveRepoPath(relativePath: string): string {
  return resolve(process.cwd(), relativePath);
}

/**
 * Formats a server configuration into a human-readable command string.
 *
 * @param config - The server configuration to format
 * @returns A formatted command string
 */
export function formatServerConfig(config: ServerConfig): string {
  const args = Array.isArray(config.args) ? config.args.join(' ') : '';
  if (args.length > 0) {
    return `${config.command} ${args}`;
  }
  return config.command;
}

/**
 * Creates a deep clone of a server configuration.
 *
 * @param config - The server configuration to clone
 * @returns A deep clone of the configuration
 */
export function cloneServerConfig(config: ServerConfig): ServerConfig {
  return deepClone(config);
}

/**
 * Creates a default funnel configuration object.
 *
 * @returns A new default configuration object with empty servers and core tools exposed
 */
export function createDefaultFunnelConfig(): Record<string, unknown> {
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

/**
 * Parses server configurations from funnel config format.
 *
 * @param value - The value to parse (can be array or object)
 * @returns A record of validated server configurations
 */
export function parseFunnelServers(value: unknown): Record<string, ServerConfig> {
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
 * Orders server configurations alphabetically by name.
 *
 * @param servers - The server configurations to order
 * @returns A new record with servers sorted alphabetically by key
 */
export function orderRecord(
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
 * Standard indentation size for JSON serialization
 */
export { INDENT_SIZE };
