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

export const ToolOverrideSchema = z.object({
  name: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  inputSchema: z
    .object({
      strategy: z.enum(['replace', 'merge', 'deep-merge']).default('merge'),
      properties: z
        .record(
          z.string(),
          z.record(
            z.string(),
            z.union([
              z.string(),
              z.number(),
              z.boolean(),
              z.array(z.string()),
              z.record(z.string(), z.string()),
            ]),
          ),
        )
        .optional(),
      required: z.array(z.string()).optional(),
      propertyOverrides: z
        .record(
          z.string(),
          z.object({
            description: z.string().optional(),
            default: z
              .union([z.string(), z.number(), z.boolean(), z.null()])
              .optional(),
            enum: z
              .array(z.union([z.string(), z.number(), z.boolean()]))
              .optional(),
            type: z
              .enum(['string', 'number', 'boolean', 'object', 'array'])
              .optional(),
          }),
        )
        .optional(),
    })
    .optional(),
  annotations: z
    .object({
      category: z.string().optional(),
      tags: z.array(z.string()).optional(),
      deprecated: z.boolean().optional(),
      deprecationMessage: z.string().optional(),
    })
    .optional(),
});

export const ProxyConfigSchema = z.object({
  servers: z.union([
    z.array(TargetServerSchema),
    z.record(z.string(), TargetServerWithoutNameSchema),
  ]),
  alwaysVisibleTools: z.array(z.string()).optional(),
  exposeTools: z.array(z.string()).optional(),
  hideTools: z.array(z.string()).optional(),
  exposeCoreTools: z.array(z.string()).optional(),
  toolsets: z.record(z.string(), z.array(z.string())).optional(),
  // Registry URLs for MCP server discovery
  registries: z.array(z.string()).optional(),
  registrySettings: z
    .object({
      autoSearch: z.boolean().default(true),
    })
    .optional(),
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
  toolOverrides: z.record(z.string(), ToolOverrideSchema).optional(),
  overrideSettings: z
    .object({
      allowPreRegistration: z.boolean().default(false),
      warnOnMissingTools: z.boolean().default(true),
      applyToDynamic: z.boolean().default(true),
      validateOverrides: z.boolean().default(true),
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
export type ToolOverride = z.infer<typeof ToolOverrideSchema>;
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
