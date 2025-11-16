import { z } from 'zod';

export const StreamableHTTPTransportConfigSchema = z.object({
  type: z.literal('streamable-http'),
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
  sessionId: z.string().optional(),
});
