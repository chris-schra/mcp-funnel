/**
 * Shared types for OAuth and transport configuration.
 * This module re-exports all shared types used across the MCP OAuth implementation.
 */

// Authentication types
export type {
  AuthConfig,
  NoAuthConfig,
  BearerAuthConfig,
  OAuth2ClientCredentialsConfig,
  OAuth2AuthCodeConfig,
} from './auth.types.js';

// Transport types
export type {
  TransportConfig,
  StdioTransportConfig,
  SSETransportConfig,
  WebSocketTransportConfig,
  ReconnectionConfig,
} from './transport.types.js';

// Server types
export type {
  BaseTargetServer,
  ExtendedTargetServer,
  ExtendedTargetServerWithoutName,
} from './server.types.js';
