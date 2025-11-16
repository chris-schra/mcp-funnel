/**
 * Interface for inbound authentication validation
 * Used to validate requests coming into the proxy server
 */

import type { Context } from 'hono';

/**
 * Result of authentication validation
 */
export interface AuthResult {
  /** Whether the request is authenticated */
  isAuthenticated: boolean;
  /** Error message if authentication failed */
  error?: string;
  /** Additional context about the authenticated user/client */
  context?: Record<string, unknown>;
}

/**
 * Interface for inbound authentication validators
 * Implementations validate incoming requests to the proxy server
 */
export interface IInboundAuthValidator {
  /**
   * Validates an incoming request for authentication
   * @param context - Hono context containing request details
   * @returns Promise resolving to authentication result
   */
  validateRequest(context: Context): Promise<AuthResult>;

  /**
   * Returns the authentication type/method this validator handles
   */
  getType(): string;
}

/**
 * Configuration for inbound bearer token authentication
 */
export interface InboundBearerAuthConfig {
  type: 'bearer';
  /** Array of valid bearer tokens that are accepted */
  tokens: string[];
}

/**
 * Configuration for no inbound authentication (open access)
 */
export interface InboundNoAuthConfig {
  type: 'none';
}

/**
 * Union type for all supported inbound authentication configurations
 */
export type InboundAuthConfig = InboundBearerAuthConfig | InboundNoAuthConfig;
