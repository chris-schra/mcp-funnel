import { z } from 'zod';
import {
  OAuth2AuthCodeConfigSchema,
  OAuth2ClientCredentialsConfigSchema,
} from '@mcp-funnel/auth';
import { NoAuthConfigSchema } from './NoAuthConfigSchema';
import { BearerAuthConfigSchema } from './BearerAuthConfigSchema.js';

export const AuthConfigSchema = z.union([
  NoAuthConfigSchema,
  BearerAuthConfigSchema,
  OAuth2ClientCredentialsConfigSchema,
  OAuth2AuthCodeConfigSchema,
]);
