/**
 * Test OAuth2 Server for Integration Tests
 *
 * A real OAuth2 server implementation for testing purposes.
 * Implements OAuth2 Client Credentials flow (RFC 6749 Section 4.4)
 * with proper HTTP responses for integration testing.
 *
 * This is NOT a mock - it's a real HTTP server that implements
 * the OAuth2 protocol for testing purposes.
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { URL, URLSearchParams } from 'url';
import { randomUUID } from 'crypto';

export interface TestOAuthServerConfig {
  port?: number;
  validClientId?: string;
  validClientSecret?: string;
  tokenLifetime?: number; // in seconds
}

export interface TestToken {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  scope?: string;
  issuedAt: number;
}

/**
 * Real OAuth2 server for integration testing
 */
export class TestOAuthServer {
  private server: Server;
  private port: number;
  private validClientId: string;
  private validClientSecret: string;
  private tokenLifetime: number;
  private issuedTokens: Map<string, TestToken> = new Map();

  public constructor(config: TestOAuthServerConfig = {}) {
    this.port = config.port ?? 0; // 0 = random available port
    this.validClientId = config.validClientId ?? 'test-client-id';
    this.validClientSecret = config.validClientSecret ?? 'test-client-secret';
    this.tokenLifetime = config.tokenLifetime ?? 3600; // 1 hour

    this.server = createServer(this.handleRequest.bind(this));
  }

  /**
   * Start the OAuth server
   */
  public async start(): Promise<{ port: number; url: string }> {
    return new Promise((resolve, reject) => {
      this.server.listen(this.port, (error?: Error) => {
        if (error) {
          reject(error);
          return;
        }

        const address = this.server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to get server address'));
          return;
        }

        const actualPort = address.port;
        const url = `http://localhost:${actualPort}`;

        resolve({ port: actualPort, url });
      });
    });
  }

  /**
   * Stop the OAuth server
   */
  public async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Get information about issued tokens (for test verification)
   */
  public getIssuedTokens(): TestToken[] {
    return Array.from(this.issuedTokens.values());
  }

  /**
   * Check if a token is valid
   */
  public isTokenValid(token: string): boolean {
    const issuedToken = this.issuedTokens.get(token);
    if (!issuedToken) {
      return false;
    }

    const now = Math.floor(Date.now() / 1000);
    const expiresAt = issuedToken.issuedAt + issuedToken.expiresIn;
    return now < expiresAt;
  }

  /**
   * Expire a specific token (for testing token refresh scenarios)
   */
  public expireToken(token: string): void {
    const issuedToken = this.issuedTokens.get(token);
    if (issuedToken) {
      issuedToken.expiresIn = 0; // Set to expired
    }
  }

  /**
   * Handle incoming HTTP requests
   */
  private async handleRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(req.url!, `http://localhost:${this.port}`);

      // Set CORS headers for browser compatibility
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization',
      );

      // Handle preflight requests
      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      // OAuth2 token endpoint
      if (url.pathname === '/oauth/token' && req.method === 'POST') {
        await this.handleTokenRequest(req, res);
        return;
      }

      // Protected resource endpoint (for testing token validation)
      if (url.pathname === '/protected' && req.method === 'GET') {
        await this.handleProtectedRequest(req, res);
        return;
      }

      // Health check endpoint
      if (url.pathname === '/health' && req.method === 'GET') {
        this.sendJsonResponse(res, 200, {
          status: 'ok',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Not found
      this.sendJsonResponse(res, 404, {
        error: 'not_found',
        error_description: 'Endpoint not found',
      });
    } catch (error) {
      console.error('OAuth server error:', error);
      this.sendJsonResponse(res, 500, {
        error: 'server_error',
        error_description: 'Internal server error',
      });
    }
  }

  /**
   * Handle OAuth2 token requests (Client Credentials flow)
   */
  private async handleTokenRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    // Parse authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Basic ')) {
      this.sendJsonResponse(res, 401, {
        error: 'invalid_client',
        error_description: 'Client authentication required',
      });
      return;
    }

    // Decode Basic auth credentials
    const credentials = Buffer.from(authHeader.slice(6), 'base64').toString(
      'utf-8',
    );
    const [clientId, clientSecret] = credentials.split(':');

    // Validate client credentials
    if (
      clientId !== this.validClientId ||
      clientSecret !== this.validClientSecret
    ) {
      this.sendJsonResponse(res, 401, {
        error: 'invalid_client',
        error_description: 'Invalid client credentials',
      });
      return;
    }

    // Parse request body
    const body = await this.parseRequestBody(req);
    const params = new URLSearchParams(body);

    // Validate grant type
    if (params.get('grant_type') !== 'client_credentials') {
      this.sendJsonResponse(res, 400, {
        error: 'unsupported_grant_type',
        error_description: 'Only client_credentials grant type is supported',
      });
      return;
    }

    // Generate access token
    const accessToken = `test-access-${randomUUID()}`;
    const scope = params.get('scope') || undefined;
    const now = Math.floor(Date.now() / 1000);

    const token: TestToken = {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.tokenLifetime,
      scope,
      issuedAt: now,
    };

    // Store the token
    this.issuedTokens.set(accessToken, token);

    // Send token response
    const response: Record<string, unknown> = {
      access_token: token.accessToken,
      token_type: token.tokenType,
      expires_in: token.expiresIn,
    };

    if (scope) {
      response.scope = scope;
    }

    this.sendJsonResponse(res, 200, response);
  }

  /**
   * Handle requests to protected resources (for testing token validation)
   */
  private async handleProtectedRequest(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      this.sendJsonResponse(res, 401, {
        error: 'invalid_token',
        error_description: 'Bearer token required',
      });
      return;
    }

    const token = authHeader.slice(7);

    if (!this.isTokenValid(token)) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      this.sendJsonResponse(res, 401, {
        error: 'invalid_token',
        error_description: 'Token is invalid or expired',
      });
      return;
    }

    // Token is valid, return protected resource
    this.sendJsonResponse(res, 200, {
      message: 'Access granted to protected resource',
      token_info: {
        valid: true,
        issued_token: this.issuedTokens.get(token),
      },
    });
  }

  /**
   * Parse request body as text
   */
  private async parseRequestBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        resolve(body);
      });
      req.on('error', reject);
    });
  }

  /**
   * Send JSON response
   */
  private sendJsonResponse(
    res: ServerResponse,
    statusCode: number,
    data: unknown,
  ): void {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
    });
    res.end(JSON.stringify(data));
  }
}

/**
 * Helper function to create and start a test OAuth server
 */
export async function createTestOAuthServer(
  config?: TestOAuthServerConfig,
): Promise<{
  server: TestOAuthServer;
  port: number;
  url: string;
  tokenEndpoint: string;
  protectedEndpoint: string;
}> {
  const server = new TestOAuthServer(config);
  const { port, url } = await server.start();

  return {
    server,
    port,
    url,
    tokenEndpoint: `${url}/oauth/token`,
    protectedEndpoint: `${url}/protected`,
  };
}
