/**
 * Standard OAuth 2.0 error codes
 */
export const OAuthErrorCodes = {
  INVALID_REQUEST: 'invalid_request',
  INVALID_CLIENT: 'invalid_client',
  INVALID_GRANT: 'invalid_grant',
  UNAUTHORIZED_CLIENT: 'unauthorized_client',
  UNSUPPORTED_GRANT_TYPE: 'unsupported_grant_type',
  INVALID_SCOPE: 'invalid_scope',
  ACCESS_DENIED: 'access_denied',
  UNSUPPORTED_RESPONSE_TYPE: 'unsupported_response_type',
  SERVER_ERROR: 'server_error',
  TEMPORARILY_UNAVAILABLE: 'temporarily_unavailable',
  CONSENT_REQUIRED: 'consent_required',
} as const;

/**
 * Standard OAuth 2.0 grant types
 */
export const GrantTypes = {
  AUTHORIZATION_CODE: 'authorization_code',
  REFRESH_TOKEN: 'refresh_token',
  CLIENT_CREDENTIALS: 'client_credentials',
} as const;

/**
 * Standard OAuth 2.0 response types
 */
export const ResponseTypes = {
  CODE: 'code',
} as const;

/**
 * PKCE code challenge methods
 */
export const CodeChallengeMethods = {
  PLAIN: 'plain',
  S256: 'S256',
} as const;
