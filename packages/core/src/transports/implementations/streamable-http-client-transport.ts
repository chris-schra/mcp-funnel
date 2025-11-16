/**
 * StreamableHTTP Client Transport Implementation
 *
 * Wrapper around MCP SDK's StreamableHTTPClientTransport that integrates with
 * our auth provider interface and provides consistent error handling.
 *
 * Delegates to SDK transport while adding:
 * - IAuthProvider integration for header injection
 * - Consistent logging and error handling
 * - Auth header refresh on connection recreation
 * @public
 * @see file:../util/sdk-transport-helpers.ts - SDK transport integration utilities
 */
import { StreamableHTTPClientTransport as SDKStreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage, MessageExtraInfo } from '@modelcontextprotocol/sdk/types.js';
// Note: OAuthClientProvider from SDK is not used directly as it has a different interface
// than our simplified AuthProvider. We handle auth manually via requestInit headers.
import { TransportError } from '../errors/transport-error.js';
import type { IAuthProvider } from '../../auth/index.js';
import { logEvent } from '../../logger.js';
import {
  createSDKTransport,
  mergeAuthHeaders,
  replaceSDKTransport,
  setupSDKTransportCallbacks,
  validateStreamableHTTPUrl,
} from '../util/sdk-transport-helpers.js';

/**
 * Configuration for StreamableHTTP Client Transport.
 * @public
 */
export interface StreamableHTTPClientTransportConfig {
  /** The endpoint URL */
  url: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Auth provider for headers and token management */
  authProvider?: IAuthProvider;
  /** Session ID for the connection */
  sessionId?: string;
  /** Custom request init options */
  requestInit?: RequestInit;
  /** Reconnection configuration */
  reconnect?: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  };
}

/**
 * StreamableHTTP Client Transport wrapper that integrates with our architecture.
 * @public
 */
export class StreamableHTTPClientTransport implements Transport {
  private readonly config: {
    url: string;
    timeout: number;
    sessionId?: string;
    requestInit?: RequestInit;
    reconnect?: {
      maxAttempts: number;
      initialDelayMs: number;
      maxDelayMs: number;
      backoffMultiplier: number;
    };
  };
  private sdkTransport: SDKStreamableHTTPClientTransport;
  private readonly authProvider?: IAuthProvider;
  private currentAuthHeaders: Record<string, string> = {};
  private readonly logPrefix = 'streamable-http-client';
  private isStarted = false;
  private isClosed = false;

  // Transport interface properties
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
  public sessionId?: string;

  public constructor(config: StreamableHTTPClientTransportConfig) {
    validateStreamableHTTPUrl(config.url);
    this.authProvider = config.authProvider;

    this.config = {
      url: config.url,
      timeout: config.timeout ?? 30000,
      sessionId: config.sessionId,
      requestInit: config.requestInit,
      reconnect: config.reconnect
        ? {
            maxAttempts: config.reconnect.maxAttempts ?? 3,
            initialDelayMs: config.reconnect.initialDelayMs ?? 1000,
            maxDelayMs: config.reconnect.maxDelayMs ?? 30000,
            backoffMultiplier: config.reconnect.backoffMultiplier ?? 2,
          }
        : undefined,
    };

    try {
      this.sdkTransport = createSDKTransport({
        url: this.config.url,
        sessionId: this.config.sessionId,
        requestInit: this.config.requestInit,
        reconnect: this.config.reconnect,
      });
    } catch (error) {
      throw TransportError.connectionFailed(
        `Failed to create StreamableHTTP transport: ${error}`,
        error as Error,
      );
    }

    setupSDKTransportCallbacks(this.sdkTransport, {
      logPrefix: this.logPrefix,
      getIsClosed: () => this.isClosed,
      getOnClose: () => this.onclose,
      getOnError: () => this.onerror,
      getOnMessage: () => this.onmessage,
    });

    logEvent('debug', `${this.logPrefix}:created`, {
      url: this.config.url,
      hasAuth: !!config.authProvider,
      sessionId: this.config.sessionId,
    });
  }

  /**
   * Starts the transport connection.
   *
   * Fetches auth headers if provider configured and recreates transport with auth.
   * @throws \{Error\} When transport is closed
   * @throws \{TransportError\} When connection or auth fails
   * @public
   */
  public async start(): Promise<void> {
    if (this.isStarted) return;
    if (this.isClosed) {
      throw new Error('Transport is closed and cannot be restarted');
    }
    try {
      this.isStarted = true;
      if (this.authProvider) {
        this.currentAuthHeaders = await this.authProvider.getHeaders();
        await this.recreateTransportWithAuth();
      }
      await this.sdkTransport.start();
      this.sessionId = this.sdkTransport.sessionId;
      logEvent('info', `${this.logPrefix}:started`, {
        url: this.config.url,
        sessionId: this.sessionId,
      });
    } catch (error) {
      this.isStarted = false;
      const transportError =
        error instanceof TransportError
          ? error
          : TransportError.connectionFailed(
              `Failed to start StreamableHTTP transport: ${error}`,
              error as Error,
            );
      logEvent('error', `${this.logPrefix}:start-failed`, {
        error: transportError.message,
        code: transportError.code,
      });
      throw transportError;
    }
  }

  /**
   * Sends a JSON-RPC message.
   *
   * Delegates to SDK transport which handles HTTP requests and session management.
   * @param message - JSON-RPC message to send
   * @param options - Optional send options (resumption token support)
   * @throws \{Error\} When transport is closed or not started
   * @throws \{TransportError\} When send fails
   * @public
   */
  public async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    if (this.isClosed) throw new Error('Transport is closed');
    if (!this.isStarted) throw new Error('Transport not started');
    try {
      const sdkOptions = options
        ? {
            resumptionToken: (options as { resumptionToken?: string }).resumptionToken,
            onresumptiontoken: (options as { onresumptiontoken?: (token: string) => void })
              .onresumptiontoken,
          }
        : undefined;
      await this.sdkTransport.send(message, sdkOptions);
      logEvent('debug', `${this.logPrefix}:message-sent`, {
        method: 'method' in message ? message.method : 'response',
        id: 'id' in message ? message.id : 'none',
      });
    } catch (error) {
      const transportError =
        error instanceof TransportError
          ? error
          : TransportError.connectionFailed(`Failed to send message: ${error}`, error as Error);
      logEvent('error', `${this.logPrefix}:send-failed`, {
        error: transportError.message,
        method: 'method' in message ? message.method : 'response',
      });
      throw transportError;
    }
  }

  /**
   * Closes the transport and cleans up resources.
   *
   * Idempotent - safe to call multiple times.
   * @public
   */
  public async close(): Promise<void> {
    if (this.isClosed) return;
    try {
      this.isClosed = true;
      this.isStarted = false;
      await this.sdkTransport.close();
      logEvent('info', `${this.logPrefix}:closed`, {
        url: this.config.url,
        sessionId: this.sessionId,
      });
      if (this.onclose) this.onclose();
    } catch (error) {
      logEvent('error', `${this.logPrefix}:close-failed`, {
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Sets the MCP protocol version.
   *
   * Delegates to SDK transport.
   * @param version - Protocol version string
   * @public
   */
  public setProtocolVersion?(version: string): void {
    this.sdkTransport.setProtocolVersion(version);
    logEvent('debug', `${this.logPrefix}:protocol-version`, { version });
  }

  /**
   * Completes OAuth authorization flow.
   *
   * Delegates to SDK transport's OAuth handling.
   * @param authorizationCode - Authorization code from OAuth callback
   * @throws \{TransportError\} When authorization completion fails
   * @public
   */
  public async finishAuth(authorizationCode: string): Promise<void> {
    try {
      await this.sdkTransport.finishAuth(authorizationCode);
      logEvent('info', `${this.logPrefix}:auth-completed`);
    } catch (error) {
      const transportError = TransportError.connectionFailed(
        `Failed to complete OAuth authorization: ${error}`,
        error as Error,
      );
      logEvent('error', `${this.logPrefix}:auth-failed`, {
        error: transportError.message,
      });
      throw transportError;
    }
  }

  /**
   * Terminates the current session.
   *
   * Sends session termination request to server via SDK transport.
   * @public
   */
  public async terminateSession(): Promise<void> {
    try {
      await this.sdkTransport.terminateSession();
      logEvent('info', `${this.logPrefix}:session-terminated`, {
        sessionId: this.sessionId,
      });
    } catch (error) {
      logEvent('error', `${this.logPrefix}:session-termination-failed`, {
        error: String(error),
        sessionId: this.sessionId,
      });
      throw error;
    }
  }

  /**
   * Gets the current protocol version.
   * @returns Current protocol version string or undefined if not set
   * @public
   */
  public get protocolVersion(): string | undefined {
    return this.sdkTransport.protocolVersion;
  }

  /**
   * Upgrades transport type while preserving auth headers and state.
   * @param _type - Target transport type (currently unused)
   * @throws \{Error\} When transport is closed
   * @public
   */
  public async upgradeTransport(_type: 'websocket' | 'sse' | 'http'): Promise<void> {
    if (this.isClosed) throw new Error('Cannot upgrade closed transport');
    await this.recreateTransportWithAuth();
    if (this.isStarted) {
      await this.sdkTransport.start();
      this.sessionId = this.sdkTransport.sessionId;
    }
  }

  /**
   * Recreates SDK transport with current auth headers.
   *
   * Used during start() and upgrade operations to inject auth headers.
   * @internal
   */
  private async recreateTransportWithAuth(): Promise<void> {
    const requestInitWithAuth = mergeAuthHeaders(this.config.requestInit, this.currentAuthHeaders);
    const newTransport = createSDKTransport({
      url: this.config.url,
      sessionId: this.config.sessionId,
      requestInit: requestInitWithAuth,
      reconnect: this.config.reconnect,
    });
    await replaceSDKTransport(this.sdkTransport, newTransport);
    this.sdkTransport = newTransport;
    setupSDKTransportCallbacks(this.sdkTransport, {
      logPrefix: this.logPrefix,
      getIsClosed: () => this.isClosed,
      getOnClose: () => this.onclose,
      getOnError: () => this.onerror,
      getOnMessage: () => this.onmessage,
    });
  }
}
