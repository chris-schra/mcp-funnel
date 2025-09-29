import { z } from 'zod';
import { TargetServerSchema } from './TargetServerSchema.js';
import { TargetServerWithoutNameSchema } from './TargetServerWithoutNameSchema.js';
import { SecretProviderConfigSchema } from './SecretProviders.js';

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
  defaultSecretProviders: z.array(SecretProviderConfigSchema).optional(),
  defaultPassthroughEnv: z.array(z.string()).optional(),
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
  autoReconnect: z
    .object({
      enabled: z.boolean().default(true),
      maxAttempts: z.number().default(10),
      initialDelayMs: z.number().default(1000),
      backoffMultiplier: z.number().default(2),
      maxDelayMs: z.number().default(60000),
      jitter: z.number().default(0.25),
    })
    .optional(),
});
