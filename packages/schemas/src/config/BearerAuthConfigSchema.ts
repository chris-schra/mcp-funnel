import { z } from 'zod';

export const BearerAuthConfigSchema = z.object({
  type: z.literal('bearer'),
  token: z.string(),
});

export type BearerAuthConfigZod = z.infer<typeof BearerAuthConfigSchema>;
