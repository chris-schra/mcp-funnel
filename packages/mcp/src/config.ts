import { z } from 'zod';

export const TargetServerSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const TargetServerWithoutNameSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const ProxyConfigSchema = z.object({
  servers: z.union([
    z.array(TargetServerSchema),
    z.record(z.string(), TargetServerWithoutNameSchema),
  ]),
  exposeTools: z.array(z.string()).optional(),
  hideTools: z.array(z.string()).optional(),
  exposeCoreTools: z.array(z.string()).optional(),
  enableDynamicDiscovery: z.boolean().optional(),
  hackyDiscovery: z.boolean().optional(),
  toolsets: z.record(z.string(), z.array(z.string())).optional(),
  // If true, bridge_tool_request may resolve unprefixed tool names to a unique
  // fully-prefixed match (e.g., "echo" -> "mockserver__echo"). Defaults to false.
  allowShortToolNames: z.boolean().optional(),
  commands: z
    .object({
      enabled: z.boolean().default(false),
      list: z
        .array(z.string())
        .optional()
        .describe('List of command names to enable, empty means all'),
    })
    .optional(),
  // @deprecated Use 'commands' instead of 'developmentTools'
  developmentTools: z
    .object({
      enabled: z.boolean().default(false),
      tools: z
        .array(z.string())
        .optional()
        .describe('List of tool names to enable, empty means all'),
    })
    .optional(),
});

export type TargetServer = z.infer<typeof TargetServerSchema>;
export type TargetServerWithoutName = z.infer<
  typeof TargetServerWithoutNameSchema
>;
export type ServersRecord = Record<string, TargetServerWithoutName>;
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;

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
export function normalizeServers(
  servers: TargetServer[] | ServersRecord,
): TargetServer[] {
  if (Array.isArray(servers)) {
    return servers;
  }

  return Object.entries(servers).map(([name, server]) => ({
    name,
    ...server,
  }));
}
