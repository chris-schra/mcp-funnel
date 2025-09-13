import { z } from 'zod';

export const ServerStatusSchema = z.object({
  name: z.string(),
  status: z.enum(['connected', 'disconnected', 'error']),
  connectedAt: z.string().datetime().optional(),
  error: z.string().optional(),
});

export const ToolSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  inputSchema: z.unknown().optional(),
  serverName: z.string(),
  enabled: z.boolean(),
});

// HTTP body for execute via REST
export const ExecuteToolBodySchema = z.object({
  arguments: z.record(z.string(), z.unknown()).optional(),
});

// WS payload for execute messages
export const ExecuteToolSchema = z.object({
  toolName: z.string(),
  arguments: z.record(z.string(), z.unknown()).optional(),
});

export const ConfigUpdateSchema = z.object({
  hideTools: z.array(z.string()).optional(),
  exposeTools: z.array(z.string()).optional(),
  enableDynamicDiscovery: z.boolean().optional(),
  hackyDiscovery: z.boolean().optional(),
});

export const WSMessageSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('subscribe'),
    events: z.array(z.string()),
  }),
  z.object({
    type: z.literal('unsubscribe'),
    events: z.array(z.string()),
  }),
  z.object({
    type: z.literal('execute'),
    payload: ExecuteToolSchema,
  }),
]);

export const WSEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('server.connected'),
    payload: z.object({
      serverName: z.string(),
      timestamp: z.string(),
    }),
  }),
  z.object({
    type: z.literal('server.disconnected'),
    payload: z.object({
      serverName: z.string(),
      timestamp: z.string(),
      reason: z.string().optional(),
    }),
  }),
  z.object({
    type: z.literal('tool.executing'),
    payload: z.object({
      toolName: z.string(),
      arguments: z.unknown(),
      requestId: z.string(),
      timestamp: z.string(),
    }),
  }),
  z.object({
    type: z.literal('tool.result'),
    payload: z.object({
      toolName: z.string(),
      requestId: z.string(),
      result: z.unknown(),
      error: z.string().optional(),
      duration: z.number(),
      timestamp: z.string(),
    }),
  }),
  z.object({
    type: z.literal('log.message'),
    payload: z.object({
      level: z.enum(['info', 'warn', 'error', 'debug']),
      message: z.string(),
      source: z.string(),
      timestamp: z.string(),
    }),
  }),
  z.object({
    type: z.literal('tools.changed'),
    payload: z.object({
      tools: z.array(ToolSchema),
      timestamp: z.string(),
    }),
  }),
]);

export type ServerStatus = z.infer<typeof ServerStatusSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type ExecuteTool = z.infer<typeof ExecuteToolSchema>;
export type ExecuteToolBody = z.infer<typeof ExecuteToolBodySchema>;
export type ConfigUpdate = z.infer<typeof ConfigUpdateSchema>;
export type WSMessage = z.infer<typeof WSMessageSchema>;
export type WSEvent = z.infer<typeof WSEventSchema>;
