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

// Auth configuration schemas
export const NoAuthConfigSchema = z.object({
  type: z.literal('none'),
});

export const BearerAuthConfigSchema = z.object({
  type: z.literal('bearer'),
  token: z.string(),
});

// Base schema for OAuth2 client credentials
const OAuth2ClientCredentialsBaseSchema = z.object({
  type: z.literal('oauth2-client'),
  clientId: z.string(),
  clientSecret: z.string(),
  tokenEndpoint: z.string(),
  scope: z.string().optional(),
  audience: z.string().optional(),
});

export const OAuth2ClientCredentialsConfigSchema = z.preprocess(
  (input: unknown) => {
    if (typeof input !== 'object' || input === null) return input;

    const result = { ...input } as Record<string, unknown>;

    // Handle tokenUrl/tokenEndpoint - prefer tokenEndpoint, convert tokenUrl to tokenEndpoint
    if (result.tokenEndpoint) {
      // Keep tokenEndpoint as-is, remove tokenUrl if it exists
      delete result.tokenUrl;
    } else if (result.tokenUrl) {
      result.tokenEndpoint = result.tokenUrl;
      delete result.tokenUrl;
    }

    // Handle scope/scopes - prefer scopes if both exist, convert array to string
    if (result.scopes) {
      if (Array.isArray(result.scopes)) {
        result.scope = result.scopes.join(' ');
      } else {
        result.scope = result.scopes;
      }
      delete result.scopes;
    }

    return result;
  },
  OAuth2ClientCredentialsBaseSchema,
);

// Base schema for OAuth2 authorization code
const OAuth2AuthCodeBaseSchema = z.object({
  type: z.literal('oauth2-code'),
  clientId: z.string(),
  clientSecret: z.string().optional(),
  authorizationEndpoint: z.string(),
  tokenEndpoint: z.string(),
  redirectUri: z.string(),
  scope: z.string().optional(),
  audience: z.string().optional(),
});

export const OAuth2AuthCodeConfigSchema = z.preprocess((input: unknown) => {
  if (typeof input !== 'object' || input === null) return input;

  const result = { ...input } as Record<string, unknown>;

  // Handle authUrl/authorizationEndpoint - prefer authorizationEndpoint, convert authUrl to authorizationEndpoint
  if (result.authorizationEndpoint) {
    // Keep authorizationEndpoint as-is, remove authUrl if it exists
    delete result.authUrl;
  } else if (result.authUrl) {
    result.authorizationEndpoint = result.authUrl;
    delete result.authUrl;
  }

  // Handle tokenUrl/tokenEndpoint - prefer tokenEndpoint, convert tokenUrl to tokenEndpoint
  if (result.tokenEndpoint) {
    // Keep tokenEndpoint as-is, remove tokenUrl if it exists
    delete result.tokenUrl;
  } else if (result.tokenUrl) {
    result.tokenEndpoint = result.tokenUrl;
    delete result.tokenUrl;
  }

  // Handle scope/scopes - prefer scopes if both exist, convert array to string
  if (result.scopes) {
    if (Array.isArray(result.scopes)) {
      result.scope = result.scopes.join(' ');
    } else {
      result.scope = result.scopes;
    }
    delete result.scopes;
  }

  return result;
}, OAuth2AuthCodeBaseSchema);

export const AuthConfigSchema = z.union([
  NoAuthConfigSchema,
  BearerAuthConfigSchema,
  OAuth2ClientCredentialsConfigSchema,
  OAuth2AuthCodeConfigSchema,
]);

// Transport configuration schemas
export const StdioTransportConfigSchema = z.object({
  type: z.literal('stdio'),
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

export const SSETransportConfigSchema = z.object({
  type: z.literal('sse'),
  url: z.string(),
  timeout: z.number().optional(),
  reconnect: z
    .object({
      maxAttempts: z.number().optional(),
      initialDelayMs: z.number().optional(),
      maxDelayMs: z.number().optional(),
      backoffMultiplier: z.number().optional(),
    })
    .optional(),
});

export const WebSocketTransportConfigSchema = z.object({
  type: z.literal('websocket'),
  url: z.string(),
  timeout: z.number().optional(),
  reconnect: z
    .object({
      maxAttempts: z.number().optional(),
      initialDelayMs: z.number().optional(),
      maxDelayMs: z.number().optional(),
      backoffMultiplier: z.number().optional(),
    })
    .optional(),
});

export const TransportConfigSchema = z.discriminatedUnion('type', [
  StdioTransportConfigSchema,
  SSETransportConfigSchema,
  WebSocketTransportConfigSchema,
]);

// Extended target server schema that includes auth and transport
export const ExtendedTargetServerSchema = z
  .object({
    name: z.string(),
    command: z.string().optional(), // Make optional to allow transport-only configs
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    transport: TransportConfigSchema.optional(),
    auth: AuthConfigSchema.optional(),
  })
  .refine((data) => data.command || data.transport, {
    message: "Server must have either 'command' or 'transport'",
  });

// Extended target server without name (for record format)
export const ExtendedTargetServerWithoutNameSchema = z
  .object({
    command: z.string().optional(), // Make optional to allow transport-only configs
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    transport: TransportConfigSchema.optional(),
    auth: AuthConfigSchema.optional(),
  })
  .refine((data) => data.command || data.transport, {
    message: "Server must have either 'command' or 'transport'",
  });

export const ProxyConfigSchema = z.object({
  servers: z.union([
    z.array(z.union([TargetServerSchema, ExtendedTargetServerSchema])),
    z.record(
      z.string(),
      z.union([
        TargetServerWithoutNameSchema,
        ExtendedTargetServerWithoutNameSchema,
      ]),
    ),
  ]),
  alwaysVisibleTools: z.array(z.string()).optional(),
  exposeTools: z.array(z.string()).optional(),
  hideTools: z.array(z.string()).optional(),
  exposeCoreTools: z.array(z.string()).optional(),
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
  autoReconnect: z
    .object({
      enabled: z.boolean().default(true),
      maxAttempts: z.number().default(10),
      initialDelayMs: z.number().default(1000),
      backoffMultiplier: z.number().default(2),
      maxDelayMs: z.number().default(60000),
    })
    .optional(),
});

export type TargetServer = z.infer<typeof TargetServerSchema>;

export type TargetServerWithoutName = z.infer<
  typeof TargetServerWithoutNameSchema
>;
export type ServersRecord = Record<string, TargetServerWithoutName>;
export type ExtendedServersRecord = Record<
  string,
  ExtendedTargetServerWithoutNameZod
>;
export type ToolOverride = z.infer<typeof ToolOverrideSchema>;
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;

// OAuth and transport schema types (Zod-derived)
export type NoAuthConfigZod = z.infer<typeof NoAuthConfigSchema>;
export type BearerAuthConfigZod = z.infer<typeof BearerAuthConfigSchema>;
export type OAuth2ClientCredentialsConfigZod = z.infer<
  typeof OAuth2ClientCredentialsConfigSchema
>;
export type OAuth2AuthCodeConfigZod = z.infer<
  typeof OAuth2AuthCodeConfigSchema
>;
export type AuthConfigZod = z.infer<typeof AuthConfigSchema>;
export type StdioTransportConfigZod = z.infer<
  typeof StdioTransportConfigSchema
>;
export type SSETransportConfigZod = z.infer<typeof SSETransportConfigSchema>;
export type WebSocketTransportConfigZod = z.infer<
  typeof WebSocketTransportConfigSchema
>;
export type TransportConfigZod = z.infer<typeof TransportConfigSchema>;
export type ExtendedTargetServerZod = z.infer<
  typeof ExtendedTargetServerSchema
>;
export type ExtendedTargetServerWithoutNameZod = z.infer<
  typeof ExtendedTargetServerWithoutNameSchema
>;

// Main type exports (re-exported from types directory for consistency)
export type {
  AuthConfig,
  NoAuthConfig,
  BearerAuthConfig,
  OAuth2ClientCredentialsConfig,
  OAuth2AuthCodeConfig,
  TransportConfig,
  StdioTransportConfig,
  SSETransportConfig,
  WebSocketTransportConfig,
  ExtendedTargetServer,
  ExtendedTargetServerWithoutName,
} from './types/index.js';

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
export function normalizeExtendedServers(
  servers:
    | (TargetServer | ExtendedTargetServerZod)[]
    | ServersRecord
    | ExtendedServersRecord,
): (TargetServer | ExtendedTargetServerZod)[] {
  if (Array.isArray(servers)) {
    return servers;
  }

  return Object.entries(servers).map(([name, server]) => ({
    name,
    ...server,
  }));
}
