import { z } from 'zod';

export const NoAuthConfigSchema = z.object({
  type: z.literal('none'),
});

export type NoAuthConfigZod = z.infer<typeof NoAuthConfigSchema>;
