/**
 * MCP server initialization and migration orchestration
 */

import { promises as fs } from 'fs';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { createBackup } from './init/backup.js';
import {
  isMcpFunnelReference,
  aggregateServers as aggregateServersWithFiltering,
  type AggregatedServer,
} from './init/detection.js';
import { analyzeConfigs, determineTargetPath } from './init/config-location.js';
import {
  mergeServersIntoFunnel as mergeServersWithConflicts,
  type MergeResult,
} from './init/conflicts.js';
import { selectServerConfigs } from './init/selection.js';
import { locators } from './init/locators.js';
import {
  fileExists,
  isRecord,
  parseFunnelServers,
  orderRecord,
  createDefaultFunnelConfig,
  formatServerConfig,
  INDENT_SIZE,
} from './init/utils.js';
import type { LocatedConfigSnapshot, FunnelConfigState, ServerConfig } from './init/types.js';

// Re-export types and constants for backward compatibility
export type {
  CliId,
  ConfigScope,
  ServerConfig,
  ConfigSnapshot,
  LocatedConfigSnapshot,
  ConfigLocator,
  FunnelConfigState,
} from './init/types.js';

/**
 * Loads a funnel configuration file from disk.
 *
 * @param path - The path to the configuration file
 * @returns A promise resolving to the funnel configuration state
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
 * Writes a funnel configuration file to disk.
 *
 * @param path - The path to write the configuration file
 * @param servers - The server configurations to write
 * @param existingData - Optional existing configuration data to merge with
 * @returns A promise that resolves when the file is written
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

/**
 * Discovers all MCP configuration files across supported clients and scopes.
 *
 * @returns A promise resolving to an array of located configuration snapshots
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
 * Displays discovered configurations to the console.
 *
 * @param snapshots - The discovered configuration snapshots to display
 * @returns void
 */
function displayDiscoveredConfigs(snapshots: readonly LocatedConfigSnapshot[]): void {
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
}

/**
 * Displays aggregated servers that need migration.
 *
 * @param aggregated - The aggregated server entries to display
 * @returns void
 */
function displayAggregatedServers(aggregated: readonly AggregatedServer[]): void {
  console.info('\nFound servers to migrate:');
  for (const entry of aggregated) {
    const sources = entry.occurrences.map((o) => o.snapshot.label).join(', ');
    console.info(`  • ${entry.name} (from ${sources})`);
  }
}

/**
 * Loads an existing funnel configuration or creates a new one.
 *
 * @param targetPath - The path to the funnel configuration file
 * @returns A promise resolving to the funnel configuration state
 */
async function loadOrCreateFunnelState(targetPath: string): Promise<FunnelConfigState> {
  if (await fileExists(targetPath)) {
    return await loadFunnelConfig(targetPath);
  }
  return {
    path: targetPath,
    exists: false,
    servers: {},
    data: createDefaultFunnelConfig(),
    raw: '{}',
  };
}

/**
 * Displays the results of merging servers.
 *
 * @param mergeResult - The merge result to display
 * @returns void
 */
function displayMergeResults(mergeResult: MergeResult): void {
  if (mergeResult.added.length > 0) {
    console.info(`  Added: ${mergeResult.added.join(', ')}`);
  }
  if (mergeResult.replaced.length > 0) {
    console.info(`  Replaced: ${mergeResult.replaced.join(', ')}`);
  }
  if (mergeResult.skipped.length > 0) {
    console.info(`  Skipped: ${mergeResult.skipped.join(', ')}`);
  }
}

/**
 * Updates client configuration files to use mcp-funnel.
 *
 * @param snapshots - The configuration snapshots to update
 * @param targetPath - The path to the funnel configuration file
 * @returns A promise resolving to the list of updated configuration labels
 */
async function updateClientConfigsToUseFunnel(
  snapshots: readonly LocatedConfigSnapshot[],
  targetPath: string,
): Promise<string[]> {
  const updatedConfigs: string[] = [];

  for (const snapshot of snapshots) {
    const needsUpdate = Object.keys(snapshot.servers).some(
      (name) => !isMcpFunnelReference(name, snapshot.servers[name]),
    );

    if (!needsUpdate) continue;

    await createBackup(snapshot.path);

    const mcpFunnelServer: ServerConfig = {
      command: 'npx',
      args: ['-y', 'mcp-funnel', targetPath],
    };

    await snapshot.locator.replaceServers(snapshot, {
      'mcp-funnel': mcpFunnelServer,
    });

    updatedConfigs.push(snapshot.label);
  }

  return updatedConfigs;
}

/**
 * Runs the initialization process to migrate MCP server configurations to mcp-funnel.
 *
 * @returns A promise that resolves when initialization is complete
 */
export async function runInit(): Promise<void> {
  console.info('🔍 Gathering MCP server configurations...');

  const snapshots = await discoverAllConfigs();

  if (snapshots.length === 0) {
    console.info('No existing MCP server configurations were found.');
    return;
  }

  displayDiscoveredConfigs(snapshots);

  const aggregated = aggregateServersWithFiltering(snapshots);
  if (aggregated.length === 0) {
    console.info('✅ All configurations already use mcp-funnel. Nothing to migrate.');
    return;
  }

  displayAggregatedServers(aggregated);

  const rl = readline.createInterface({ input, output });

  try {
    const analysis = await analyzeConfigs();
    const targetPath = await determineTargetPath(analysis, rl);
    const funnelState = await loadOrCreateFunnelState(targetPath);

    console.info('\nSelecting server configurations...');
    const selections = await selectServerConfigs(aggregated, rl);

    if (Object.keys(selections).length === 0) {
      console.info('\nNo servers selected. Exiting.');
      return;
    }

    const mergeResult = await mergeServersWithConflicts(rl, funnelState, selections);
    const hasChanges = mergeResult.added.length > 0 || mergeResult.replaced.length > 0;

    if (!hasChanges) {
      console.info('\nNo new servers to add. Exiting.');
      return;
    }

    if (funnelState.exists) {
      await createBackup(targetPath);
    }

    await writeFunnelConfig(targetPath, mergeResult.merged, funnelState.data);
    console.info(`\n✅ Updated ${targetPath}`);

    displayMergeResults(mergeResult);

    const updatedConfigs = await updateClientConfigsToUseFunnel(snapshots, targetPath);

    if (updatedConfigs.length > 0) {
      console.info(`\nUpdated client configs: ${updatedConfigs.join(', ')}`);
    }

    console.info('\n✅ Migration complete!');
  } finally {
    await rl.close();
  }
}

/**
 * Export locators for testing and external use
 */
export const configLocators = locators;
