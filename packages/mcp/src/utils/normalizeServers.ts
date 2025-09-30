import type {
  ExtendedServersRecord,
  ServersRecord,
  TargetServer,
  TargetServerZod,
} from '@mcp-funnel/schemas';

/**
 * Normalizes server configurations from either array or record format into standardized array format.
 *
 * Supports both configuration formats:
 * - Array format: `[{ name: "server1", command: "cmd", ... }, ...]`
 * - Record format: `{ "server1": { command: "cmd", ... }, ... }`
 *
 * When using record format, object keys become server names. This avoids
 * repeating the name in both the key and configuration object.
 *
 * Handles both legacy (TargetServer) and extended (with auth/transport) configurations.
 * @param {(TargetServer | TargetServerZod)[] | ServersRecord | ExtendedServersRecord} servers - Server configurations in either array or record format
 * @returns {(TargetServer | TargetServerZod)[]} Normalized array of server configurations with name property included
 * @example Array format (already normalized)
 * ```typescript
 * const arrayServers = [{ name: "github", command: "gh-server" }];
 * normalizeServers(arrayServers); // Returns the same array
 * ```
 * @example Record format (gets converted to array)
 * ```typescript
 * const recordServers = {
 *   "github": { command: "gh-server" },
 *   "filesystem": { command: "fs-server", args: ["--verbose"] }
 * };
 * normalizeServers(recordServers);
 * // Returns: [
 * //   { name: "github", command: "gh-server" },
 * //   { name: "filesystem", command: "fs-server", args: ["--verbose"] }
 * // ]
 * ```
 * @public
 */
export function normalizeServers(
  servers:
    | (TargetServer | TargetServerZod)[]
    | ServersRecord
    | ExtendedServersRecord,
): (TargetServer | TargetServerZod)[] {
  if (Array.isArray(servers)) {
    return servers;
  }

  return Object.entries(servers).map(([name, server]) => ({
    name,
    ...server,
  }));
}
