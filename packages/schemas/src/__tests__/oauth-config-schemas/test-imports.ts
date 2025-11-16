// Shared imports for OAuth Configuration Schema tests
export {
  NoAuthConfigSchema,
  type SSETransportConfigZod,
  type StdioTransportConfigZod,
  TargetServerSchema,
  type WebSocketTransportConfigZod,
} from '../../config/index.js';

export { TargetServerWithoutNameSchema } from '../../config/TargetServerWithoutNameSchema.js';
export { AuthConfigSchema } from '../../config/AuthConfigSchema.js';
export {
  BearerAuthConfigSchema,
  type BearerAuthConfigZod,
} from '../../config/BearerAuthConfigSchema.js';
export {
  OAuth2AuthCodeConfigSchema,
  type OAuth2AuthCodeConfigZod,
  OAuth2ClientCredentialsConfigSchema,
  type OAuth2ClientCredentialsConfigZod,
} from '@mcp-funnel/auth';
export { TransportConfigSchema } from '../../config/TransportConfigSchema.js';
export { StdioTransportConfigSchema } from '../../config/StdioTransportConfigSchema.js';
export { SSETransportConfigSchema } from '../../config/SSETransportConfigSchema.js';
