/**
 * Normalizes server configurations from either array or record format into a standardized array format.
 *
 * This function supports both configuration formats:
 * - Array format: `[{ name: "server1", command: "cmd", ... }, ...]`
 * - Record format: `{ "server1": { command: "cmd", ... }, ... }`
 *
 * When using the record format, the object keys become the server names, and the values
 * contain the server configuration without the name property. This provides a more
 * convenient way to define servers when you want to avoid repeating the name in both
 * the key and the configuration object.
 *
 * @param servers - Server configurations in either array or record format
 * @returns Normalized array of server configurations with name property included
 *
 * @example
 * // Array format (already normalized)
 * const arrayServers = [{ name: "github", command: "gh-server" }];
 * normalizeServers(arrayServers); // Returns the same array
 *
 * @example
 * // Record format (gets converted to array)
 * const recordServers = {
 *   "github": { command: "gh-server" },
 *   "filesystem": { command: "fs-server", args: ["--verbose"] }
 * };
 * normalizeServers(recordServers);
 * // Returns: [
 * //   { name: "github", command: "gh-server" },
 * //   { name: "filesystem", command: "fs-server", args: ["--verbose"] }
 * // ]
 */
import type {
  ExtendedServersRecord,
  ServersRecord,
  TargetServer,
  TargetServerZod,
} from '@mcp-funnel/schemas';

/**
 * Normalizes extended server configurations from either array or record format into a standardized array format.
 *
 * This function supports both legacy and extended server configurations:
 * - Legacy: TargetServer configurations (command-based)
 * - Extended: ExtendedTargetServer configurations (with auth and transport options)
 *
 * @param servers - Server configurations in either array or record format
 * @returns Normalized array of server configurations with name property included
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
