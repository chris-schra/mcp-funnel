import { z } from 'zod';

export const TargetServerSchema = z.object({
  name: z.string(),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const ProxyConfigSchema = z.object({
  servers: z.array(TargetServerSchema),
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
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
