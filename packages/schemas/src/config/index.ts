// Zod schema for secret provider configurations
import { z } from 'zod';
import type { TargetServerSchema } from './TargetServerSchema.js';
import type { TargetServerWithoutNameSchema } from './TargetServerWithoutNameSchema.js';
import type { AuthConfigSchema } from './AuthConfigSchema.js';
import type { StdioTransportConfigSchema } from './StdioTransportConfigSchema.js';
import type { SSETransportConfigSchema } from './SSETransportConfigSchema.js';
import type { WebSocketTransportConfigSchema } from './WebSocketTransportConfigSchema.js';

export { TargetServerSchema } from './TargetServerSchema.js';
export { ProxyConfigSchema } from './ProxyConfigSchema.js';
export { SecretProviderConfigSchema } from './SecretProviders.js';
export { BearerAuthConfigSchema } from './BearerAuthConfigSchema.js';
export { NoAuthConfigSchema } from './NoAuthConfigSchema.js';

export type TargetServerWithoutName = z.infer<typeof TargetServerWithoutNameSchema>;
export type ServersRecord = Record<string, TargetServerWithoutName>;
export type ExtendedServersRecord = Record<string, TargetServerWithoutNameZod>;

export type AuthConfigZod = z.infer<typeof AuthConfigSchema>;
export type StdioTransportConfigZod = z.infer<typeof StdioTransportConfigSchema>;
export type SSETransportConfigZod = z.infer<typeof SSETransportConfigSchema>;
export type WebSocketTransportConfigZod = z.infer<typeof WebSocketTransportConfigSchema>;
export type TargetServerZod = z.infer<typeof TargetServerSchema>;
export type TargetServerWithoutNameZod = z.infer<typeof TargetServerWithoutNameSchema>;
