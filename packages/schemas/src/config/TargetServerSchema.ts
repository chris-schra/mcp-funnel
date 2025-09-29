// Target server schema that includes auth and transport
import { z } from 'zod';
import { SecretProviderConfigSchema } from './SecretProviders.js';
import { TransportConfigSchema } from './TransportConfigSchema.js';
import { AuthConfigSchema } from './AuthConfigSchema.js';

export const TargetServerSchema = z
  .object({
    name: z.string(),
    command: z.string().optional(), // Make optional to allow transport-only configs
    args: z.array(z.string()).optional(),
    env: z.record(z.string(), z.string()).optional(),
    transport: TransportConfigSchema.optional(),
    auth: AuthConfigSchema.optional(),
    secretProviders: z.array(SecretProviderConfigSchema).optional(),
  })
  .refine((data) => data.command || data.transport, {
    message: "Server must have either 'command' or 'transport'",
  });
