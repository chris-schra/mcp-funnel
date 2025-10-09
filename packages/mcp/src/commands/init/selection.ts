/**
 * Server selection logic for handling multiple configurations
 */

import type { Interface } from 'node:readline/promises';
import type { ServerConfig } from './types.js';
import type { AggregatedServer } from './detection.js';

interface SelectionOption {
  config: ServerConfig;
  sources: string[];
}

/**
 * Groups occurrences by unique configuration
 * @param entry - The aggregated server entry to process
 * @returns Array of unique configuration options with their sources
 */
function collectUniqueConfigs(entry: AggregatedServer): SelectionOption[] {
  const uniqueConfigs = new Map<string, SelectionOption>();

  for (const occurrence of entry.occurrences) {
    // Create a stable key for the config
    const configKey = JSON.stringify(occurrence.config, Object.keys(occurrence.config).sort());

    const existing = uniqueConfigs.get(configKey);
    if (existing) {
      existing.sources.push(occurrence.snapshot.label);
    } else {
      uniqueConfigs.set(configKey, {
        config: occurrence.config,
        sources: [occurrence.snapshot.label],
      });
    }
  }

  return Array.from(uniqueConfigs.values());
}

/**
 * Prompts user to choose between multiple server configurations
 * @param rl - Readline interface for user interaction
 * @param serverName - Name of the server being configured
 * @param options - Array of configuration options to choose from
 * @returns The selected server configuration, or null if skipped
 */
async function promptForChoice(
  rl: Interface,
  serverName: string,
  options: SelectionOption[],
): Promise<ServerConfig | null> {
  console.info(`\n⚠️  Multiple configurations found for server "${serverName}":`);

  options.forEach((option, index) => {
    console.info(`\n  [${index + 1}] From: ${option.sources.join(', ')}`);

    // Format the config for display
    const { command, args, env } = option.config;
    const commandLine = args?.length ? `${command} ${args.join(' ')}` : command;

    console.info(`      Command: ${commandLine}`);

    if (env && Object.keys(env).length > 0) {
      console.info(`      Env vars: ${Object.keys(env).join(', ')}`);
    }
  });

  console.info(`  [s] Skip this server\n`);

  while (true) {
    const answer = await rl.question(
      `Select configuration for "${serverName}" (1-${options.length}, or s to skip): `,
    );
    const choice = answer.trim().toLowerCase();

    if (choice === 's' || choice === 'skip') {
      console.info(`  → Skipping ${serverName}`);
      return null;
    }

    const num = parseInt(choice, 10);
    if (num >= 1 && num <= options.length) {
      const selected = options[num - 1];
      console.info(`  → Selected configuration from ${selected.sources.join(', ')}`);
      return selected.config;
    }

    console.info('  Please enter a valid choice.');
  }
}

/**
 * Select server configurations from aggregated servers
 * Prompts user when multiple configurations exist for the same server
 * @param aggregated - Array of aggregated servers to select from
 * @param rl - Readline interface for user interaction
 * @returns Record of selected server configurations keyed by server name
 */
export async function selectServerConfigs(
  aggregated: readonly AggregatedServer[],
  rl: Interface,
): Promise<Record<string, ServerConfig>> {
  const selections: Record<string, ServerConfig> = {};

  for (const entry of aggregated) {
    const uniqueConfigs = collectUniqueConfigs(entry);

    if (uniqueConfigs.length === 0) {
      continue;
    }

    // Single configuration - use it directly
    if (uniqueConfigs.length === 1) {
      const config = uniqueConfigs[0];
      console.info(`  → Using "${entry.name}" from ${config.sources.join(', ')}`);
      selections[entry.name] = config.config;
      continue;
    }

    // Multiple configurations - prompt user
    const selected = await promptForChoice(rl, entry.name, uniqueConfigs);
    if (selected) {
      selections[entry.name] = selected;
    }
  }

  return selections;
}
