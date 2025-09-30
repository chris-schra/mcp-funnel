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
   * Starts the OAuth server and returns port and URL
   * @returns Server port and URL
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

  /** Stops the OAuth server */
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
   * Returns all issued tokens for test verification
   * @returns Array of issued tokens
   */
  public getIssuedTokens(): TestToken[] {
    return Array.from(this.issuedTokens.values());
  }

  /**
   * Checks if a token is valid and not expired
   * @param token - Access token to validate
   * @returns True if token is valid
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
   * Expires a specific token for testing refresh scenarios
   * @param token - Access token to expire
   */
  public expireToken(token: string): void {
    const issuedToken = this.issuedTokens.get(token);
    if (issuedToken) {
      issuedToken.expiresIn = 0; // Set to expired
    }
  }

  /**
   * Handles incoming HTTP requests to the OAuth server
   * @param req
   * @param res
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
   * Handles OAuth2 token requests using Client Credentials flow
   * @param req
   * @param res
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
   * Handles requests to protected resources for testing token validation
   * @param req
   * @param res
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
   * Parses request body as text
   * @param req
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
   * Sends JSON response with given status code
   * @param res
   * @param statusCode
   * @param data
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
 * Creates and starts a test OAuth server with given config
 * @param config
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
