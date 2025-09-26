import type { LocatedConfigSnapshot, ServerConfig } from '../init.js';

export interface AggregatedServer {
  readonly name: string;
  readonly occurrences: {
    readonly snapshot: LocatedConfigSnapshot;
    readonly config: ServerConfig;
  }[];
}

/**
 * Checks if a server configuration is actually mcp-funnel itself
 * to prevent infinite loops during migration.
 * Uses precise matching to avoid false positives.
 * @param name
 * @param config
 */
export function isMcpFunnelReference(name: string, config: ServerConfig): boolean {
  // Exact name match
  if (name === 'mcp-funnel' || name === 'funnel') {
    return true;
  }

  // Check if name starts with mcp-funnel (e.g., mcp-funnel-dev, mcp-funnel-local)
  if (name.toLowerCase().startsWith('mcp-funnel')) {
    return true;
  }

  const command = config.command?.toLowerCase() || '';
  const args = config.args || [];

  // Helper to check if an argument is exactly or starts with mcp-funnel
  const isMcpFunnelArg = (arg: string): boolean => {
    const normalized = arg.toLowerCase();
    // Exact match
    if (normalized === 'mcp-funnel') return true;
    // NPM package patterns
    if (normalized === '@mcp/funnel') return true;
    if (normalized.startsWith('mcp-funnel@')) return true; // e.g., mcp-funnel@1.0.0
    // Path patterns - check if it's a path to mcp-funnel
    if (normalized.match(/^[./].*mcp-funnel(?:\/|$)/)) return true;
    return false;
  };

  // Direct execution patterns
  if (command === 'mcp-funnel') {
    return true;
  }

  // NPX execution - check first non-flag argument
  if (command === 'npx') {
    // Skip flags like -y, --yes, etc.
    const nonFlagArgs = args.filter((arg) => !arg.startsWith('-'));
    if (nonFlagArgs.length > 0 && isMcpFunnelArg(nonFlagArgs[0])) {
      return true;
    }
  }

  // NPM execution - check for 'run mcp-funnel' or 'exec mcp-funnel'
  if (command === 'npm') {
    const firstArg = args[0]?.toLowerCase();
    if (firstArg === 'run' || firstArg === 'exec') {
      const scriptName = args[1]?.toLowerCase();
      if (scriptName && isMcpFunnelArg(scriptName)) {
        return true;
      }
    }
  }

  // TSX/TS-node execution of mcp-funnel source files
  if (command === 'tsx' || command === 'ts-node' || command.endsWith('/ts-node')) {
    const firstArg = args[0]?.toLowerCase() || '';
    // Check for known mcp-funnel source paths
    if (
      firstArg.includes('packages/mcp/src/cli.ts') ||
      firstArg.includes('packages/mcp/dist/cli.js') ||
      firstArg.endsWith('/mcp-funnel/cli.ts') ||
      firstArg.endsWith('/mcp-funnel/cli.js')
    ) {
      return true;
    }
  }

  // Node execution of mcp-funnel files
  if (command === 'node') {
    const firstArg = args[0]?.toLowerCase() || '';
    // Check for mcp-funnel dist files or CLI files
    if (
      firstArg.includes('mcp-funnel/dist/') ||
      firstArg.includes('mcp-funnel/cli.js') ||
      firstArg.endsWith('/mcp-funnel.js')
    ) {
      return true;
    }
  }

  return false;
}

// Update aggregateServers to use detection
/**
 *
 * @param snapshots
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
