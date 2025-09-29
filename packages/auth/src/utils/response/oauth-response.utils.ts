/**
 * OAuth response creation utilities
 */
import type { OAuthError } from '@mcp-funnel/models';

export class OAuthResponseUtils {
  /**
   * Create OAuth error response with proper headers
   */
  public static createOAuthErrorResponse(
    error: OAuthError,
    statusCode: number = 400,
  ) {
    return {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
      body: error,
    };
  }

  /**
   * Create successful token response with proper headers
   */
  public static createTokenResponse(tokenData: Record<string, unknown>) {
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        Pragma: 'no-cache',
      },
      body: tokenData,
    };
  }
}
