import { z } from 'zod';
import { TransportConfigSchema } from './TransportConfigSchema.js';
import { AuthConfigSchema } from './AuthConfigSchema.js';
import { SecretProviderConfigSchema } from './SecretProviders.js';

// Extended target server without name (for record format)
export const TargetServerWithoutNameSchema = z
  .object({
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
