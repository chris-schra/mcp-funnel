import type readline from 'node:readline/promises';
import type { ServerConfig, FunnelConfigState } from './types.js';
import { warnAboutSensitiveEnvVars } from './env-detection.js';

/**
 * Result of merging servers into funnel configuration
 */
export interface MergeResult {
  readonly merged: Record<string, ServerConfig>;
  readonly added: string[];
  readonly replaced: string[];
  readonly skipped: string[];
}

/**
 * Format a server configuration for display
 * @param config - Server configuration to format
 * @returns Formatted string showing command and args
 */
function formatServerConfig(config: ServerConfig): string {
  const parts = [config.command];
  if (config.args?.length) {
    parts.push(...config.args);
  }
  return parts.join(' ');
}

/**
 * Resolve conflicts between existing and proposed server configurations
 * @param serverName - Name of the server
 * @param existing - Existing server configuration
 * @param proposed - Proposed server configuration
 * @param rl - Readline interface for user interaction
 * @returns User's choice: 'keep', 'replace', or 'skip'
 */
async function resolveConflict(
  serverName: string,
  existing: ServerConfig,
  proposed: ServerConfig,
  rl: readline.Interface,
): Promise<'keep' | 'replace' | 'skip'> {
  console.info(`\n⚠️  Conflict for server "${serverName}":`);

  // Show command differences
  console.info(`  Existing: ${formatServerConfig(existing)}`);
  console.info(`  Proposed: ${formatServerConfig(proposed)}`);

  // Show env var differences if any
  const existingEnv = Object.keys(existing.env || {});
  const proposedEnv = Object.keys(proposed.env || {});

  if (existingEnv.length || proposedEnv.length) {
    if (existingEnv.length > 0) {
      console.info(`    Existing env: ${existingEnv.join(', ')}`);
    }
    if (proposedEnv.length > 0) {
      console.info(`    Proposed env: ${proposedEnv.join(', ')}`);
    }
  }

  while (true) {
    const answer = await rl.question('\n  [K]eep existing, [R]eplace, [S]kip? ');
    const choice = answer.trim().toLowerCase();

    if (choice === 'k' || choice === 'keep') return 'keep';
    if (choice === 'r' || choice === 'replace') return 'replace';
    if (choice === 's' || choice === 'skip') return 'skip';

    console.info('  Please enter K, R, or S');
  }
}

/**
 * Merge selected servers into funnel configuration with conflict resolution
 * @param rl - Readline interface for user interaction
 * @param funnelState - Current funnel configuration state
 * @param selections - Selected servers to merge
 * @returns Result of the merge operation
 */
export async function mergeServersIntoFunnel(
  rl: readline.Interface,
  funnelState: FunnelConfigState,
  selections: Record<string, ServerConfig>,
): Promise<MergeResult> {
  const merged: Record<string, ServerConfig> = { ...funnelState.servers };
  const added: string[] = [];
  const replaced: string[] = [];
  const skipped: string[] = [];

  for (const [name, config] of Object.entries(selections)) {
    // Warn about sensitive env vars
    warnAboutSensitiveEnvVars(name, config);

    if (merged[name]) {
      const resolution = await resolveConflict(name, merged[name], config, rl);

      switch (resolution) {
        case 'keep':
          // Keep existing, do nothing
          skipped.push(name);
          break;
        case 'replace':
          merged[name] = config;
          replaced.push(name);
          break;
        case 'skip':
          skipped.push(name);
          break;
      }
    } else {
      merged[name] = config;
      added.push(name);
    }
  }

  return { merged, added, replaced, skipped };
}
