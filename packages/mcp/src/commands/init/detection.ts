import type { LocatedConfigSnapshot, ServerConfig } from './types.js';

export interface AggregatedServer {
  readonly name: string;
  readonly occurrences: {
    readonly snapshot: LocatedConfigSnapshot;
    readonly config: ServerConfig;
  }[];
}

/**
 * Checks if an argument is an mcp-funnel reference
 * @param arg - The argument to check
 * @returns True if the argument is an mcp-funnel reference
 */
function isMcpFunnelArg(arg: string): boolean {
  const normalized = arg.toLowerCase();
  // Exact match
  if (normalized === 'mcp-funnel') return true;
  // NPM package patterns
  if (normalized === '@mcp/funnel') return true;
  if (normalized.startsWith('mcp-funnel@')) return true; // e.g., mcp-funnel@1.0.0
  // Path patterns - check if it's a path to mcp-funnel
  if (normalized.match(/^[./].*mcp-funnel(?:\/|$)/)) return true;
  return false;
}

/**
 * Checks if the server name is an mcp-funnel reference
 * @param name - The server name to check
 * @returns True if the name is an mcp-funnel reference
 */
function isMcpFunnelName(name: string): boolean {
  // Exact name match
  if (name === 'mcp-funnel' || name === 'funnel') {
    return true;
  }
  // Check if name starts with mcp-funnel (e.g., mcp-funnel-dev, mcp-funnel-local)
  if (name.toLowerCase().startsWith('mcp-funnel')) {
    return true;
  }
  return false;
}

/**
 * Checks if the command is a direct mcp-funnel command
 * @param command - The command to check
 * @returns True if the command is 'mcp-funnel'
 */
function isMcpFunnelCommand(command: string): boolean {
  return command === 'mcp-funnel';
}

/**
 * Checks if the configuration uses npx to execute mcp-funnel
 * @param command - The command to check
 * @param args - The command arguments
 * @returns True if this is an npx execution of mcp-funnel
 */
function isMcpFunnelNpxExecution(command: string, args: readonly string[]): boolean {
  if (command !== 'npx') {
    return false;
  }
  // Skip flags like -y, --yes, etc.
  const nonFlagArgs = args.filter((arg) => !arg.startsWith('-'));
  return nonFlagArgs.length > 0 && isMcpFunnelArg(nonFlagArgs[0]);
}

/**
 * Checks if the configuration uses npm to execute mcp-funnel
 * @param command - The command to check
 * @param args - The command arguments
 * @returns True if this is an npm run/exec of mcp-funnel
 */
function isMcpFunnelNpmExecution(command: string, args: readonly string[]): boolean {
  if (command !== 'npm') {
    return false;
  }
  const firstArg = args[0]?.toLowerCase();
  if (firstArg !== 'run' && firstArg !== 'exec') {
    return false;
  }
  const scriptName = args[1]?.toLowerCase();
  return scriptName ? isMcpFunnelArg(scriptName) : false;
}

/**
 * Checks if the configuration uses tsx/ts-node to execute mcp-funnel
 * @param command - The command to check
 * @param args - The command arguments
 * @returns True if this is a tsx/ts-node execution of mcp-funnel
 */
function isMcpFunnelTsxExecution(command: string, args: readonly string[]): boolean {
  if (command !== 'tsx' && command !== 'ts-node' && !command.endsWith('/ts-node')) {
    return false;
  }
  const firstArg = args[0]?.toLowerCase() || '';
  // Check for known mcp-funnel source paths
  return (
    firstArg.includes('packages/mcp/src/cli.ts') ||
    firstArg.includes('packages/mcp/dist/cli.js') ||
    firstArg.endsWith('/mcp-funnel/cli.ts') ||
    firstArg.endsWith('/mcp-funnel/cli.js')
  );
}

/**
 * Checks if the configuration uses node to execute mcp-funnel
 * @param command - The command to check
 * @param args - The command arguments
 * @returns True if this is a node execution of mcp-funnel
 */
function isMcpFunnelNodeExecution(command: string, args: readonly string[]): boolean {
  if (command !== 'node') {
    return false;
  }
  const firstArg = args[0]?.toLowerCase() || '';
  // Check for mcp-funnel dist files or CLI files
  return (
    firstArg.includes('mcp-funnel/dist/') ||
    firstArg.includes('mcp-funnel/cli.js') ||
    firstArg.endsWith('/mcp-funnel.js')
  );
}

/**
 * Checks if a server configuration is actually mcp-funnel itself
 * to prevent infinite loops during migration.
 * Uses precise matching to avoid false positives.
 * @param name - The server name
 * @param config - The server configuration to check
 * @returns True if the configuration is a reference to mcp-funnel itself
 */
export function isMcpFunnelReference(name: string, config: ServerConfig): boolean {
  const command = config.command?.toLowerCase() || '';
  const args = config.args || [];

  return (
    isMcpFunnelName(name) ||
    isMcpFunnelCommand(command) ||
    isMcpFunnelNpxExecution(command, args) ||
    isMcpFunnelNpmExecution(command, args) ||
    isMcpFunnelTsxExecution(command, args) ||
    isMcpFunnelNodeExecution(command, args)
  );
}

// Update aggregateServers to use detection
/**
 * Aggregate servers from multiple config snapshots, grouping by name
 * @param snapshots - Array of located config snapshots to aggregate
 * @returns Array of aggregated servers with their occurrences across configs
 */
export function aggregateServers(snapshots: readonly LocatedConfigSnapshot[]): AggregatedServer[] {
  const groups = new Map<string, AggregatedServer>();

  for (const snapshot of snapshots) {
    for (const [name, config] of Object.entries(snapshot.servers)) {
      // Skip ALL mcp-funnel references
      if (isMcpFunnelReference(name, config)) {
        console.info(`  Skipping mcp-funnel reference: ${name} in ${snapshot.label}`);
        continue;
      }

      let group = groups.get(name);
      if (!group) {
        group = { name, occurrences: [] };
        groups.set(name, group);
      }
      group.occurrences.push({ snapshot, config });
    }
  }

  return Array.from(groups.values())
    .filter((g) => g.occurrences.length > 0)
    .sort((a, b) => a.name.localeCompare(b.name));
}
