import { z } from 'zod';

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
