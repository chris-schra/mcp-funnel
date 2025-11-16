import { z } from 'zod';

const DotEnvProviderConfigSchema = z.object({
  type: z.literal('dotenv'),
  config: z.object({
    path: z.string(),
    encoding: z.string().optional(),
  }),
});

const ProcessEnvProviderConfigSchema = z.object({
  type: z.literal('process'),
  config: z.object({
    prefix: z.string().optional(),
    allowlist: z.array(z.string()).optional(),
    blocklist: z.array(z.string()).optional(),
  }),
});

const InlineProviderConfigSchema = z.object({
  type: z.literal('inline'),
  config: z.object({
    values: z.record(z.string(), z.string()),
  }),
});

export const SecretProviderConfigSchema = z.discriminatedUnion('type', [
  DotEnvProviderConfigSchema,
  ProcessEnvProviderConfigSchema,
  InlineProviderConfigSchema,
]);
