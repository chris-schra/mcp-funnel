import { z } from 'zod';

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
