/**
 * StreamableHTTP Client Transport Implementation
 *
 * A wrapper around the SDK's StreamableHTTPClientTransport that integrates with our
 * auth provider interface and base transport utilities.
 */

import {
  StreamableHTTPClientTransport as SDKStreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  JSONRPCMessage,
  MessageExtraInfo,
} from '@modelcontextprotocol/sdk/types.js';
// Note: OAuthClientProvider from SDK is not used directly as it has a different interface
// than our simplified AuthProvider. We handle auth manually via requestInit headers.
import { TransportError } from '../errors/transport-error.js';
import { logEvent } from '../../logger.js';
import { AuthProvider, sanitizeUrl } from '../utils/transport-utils.js';

/**
 * Configuration for StreamableHTTP Client Transport
 */
export interface StreamableHTTPClientTransportConfig {
  /** The endpoint URL */
  url: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Auth provider for headers and token management */
  authProvider?: AuthProvider;
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
 * StreamableHTTP Client Transport wrapper that integrates with our architecture
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
  private readonly authProvider?: AuthProvider;
  private currentAuthHeaders: Record<string, string> = {};
  private readonly logPrefix = 'streamable-http-client';
  private isStarted = false;
  private isClosed = false;

  // Transport interface properties
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (
    message: JSONRPCMessage,
    extra?: MessageExtraInfo,
  ) => void;
  public sessionId?: string;

  constructor(config: StreamableHTTPClientTransportConfig) {
    this.validateAndNormalizeUrl(config);
    this.authProvider = config.authProvider;

    // Apply default configuration values
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

    // Prepare SDK transport options
    const sdkOptions: StreamableHTTPClientTransportOptions = {
      requestInit: this.config.requestInit,
      sessionId: this.config.sessionId,
    };

    // Add reconnection options if provided
    if (this.config.reconnect) {
      sdkOptions.reconnectionOptions = {
        maxRetries: this.config.reconnect.maxAttempts,
        initialReconnectionDelay: this.config.reconnect.initialDelayMs,
        maxReconnectionDelay: this.config.reconnect.maxDelayMs,
        reconnectionDelayGrowFactor: this.config.reconnect.backoffMultiplier,
      };
    }

    // Create SDK transport instance
    try {
      this.sdkTransport = this.createSDKTransport(this.config.requestInit);
    } catch (error) {
      throw TransportError.connectionFailed(
        `Failed to create StreamableHTTP transport: ${error}`,
        error as Error,
      );
    }

    // Set up SDK transport callbacks
    this.setupSDKCallbacks();

    logEvent('debug', `${this.logPrefix}:created`, {
      url: sanitizeUrl(this.config.url),
      hasAuth: !!config.authProvider,
      sessionId: this.config.sessionId,
    });
  }

  /**
   * Start the transport connection
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    if (this.isClosed) {
      throw new Error('Transport is closed and cannot be restarted');
    }

    try {
      this.isStarted = true;

      // If auth provider is configured, get and store auth headers, then replace transport
      if (this.authProvider) {
        this.currentAuthHeaders = await this.authProvider.getAuthHeaders();

        // Create request init with auth headers
        const requestInitWithAuth = {
          ...this.config.requestInit,
          headers: {
            ...this.config.requestInit?.headers,
            ...this.currentAuthHeaders,
          },
        };

        // Create new SDK transport with auth headers
        const newSdkTransport = this.createSDKTransport(requestInitWithAuth);

        // Properly replace the transport
        await this.replaceTransport(newSdkTransport);
      }

      await this.sdkTransport.start();

      // Get session ID from SDK transport
      this.sessionId = this.sdkTransport.sessionId;

      logEvent('info', `${this.logPrefix}:started`, {
        url: sanitizeUrl(this.config.url),
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
   * Send a JSON-RPC message
   */
  public async send(
    message: JSONRPCMessage,
    options?: TransportSendOptions,
  ): Promise<void> {
    if (this.isClosed) {
      throw new Error('Transport is closed');
    }

    if (!this.isStarted) {
      throw new Error('Transport not started');
    }

    try {
      // Convert options to SDK format - options may include resumption token data
      const sdkOptions = options
        ? {
            resumptionToken: (options as { resumptionToken?: string })
              .resumptionToken,
            onresumptiontoken: (
              options as { onresumptiontoken?: (token: string) => void }
            ).onresumptiontoken,
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
          : TransportError.connectionFailed(
              `Failed to send message: ${error}`,
              error as Error,
            );

      logEvent('error', `${this.logPrefix}:send-failed`, {
        error: transportError.message,
        method: 'method' in message ? message.method : 'response',
      });

      throw transportError;
    }
  }

  /**
   * Close the transport and clean up resources
   */
  public async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    try {
      this.isClosed = true;
      this.isStarted = false;

      await this.sdkTransport.close();

      logEvent('info', `${this.logPrefix}:closed`, {
        url: sanitizeUrl(this.config.url),
        sessionId: this.sessionId,
      });

      // Trigger onclose callback
      if (this.onclose) {
        this.onclose();
      }
    } catch (error) {
      logEvent('error', `${this.logPrefix}:close-failed`, {
        error: String(error),
      });
      throw error;
    }
  }

  /**
   * Set protocol version (MCP SDK requirement)
   */
  public setProtocolVersion?(version: string): void {
    this.sdkTransport.setProtocolVersion(version);
    logEvent('debug', `${this.logPrefix}:protocol-version`, { version });
  }

  /**
   * Complete OAuth authorization (if auth provider supports it)
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
   * Terminate the current session
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
   * Get the current protocol version
   */
  public get protocolVersion(): string | undefined {
    return this.sdkTransport.protocolVersion;
  }

  /**
   * Upgrade transport while preserving auth headers and state
   * This method can be used to upgrade from one transport type to another
   * while maintaining authentication and configuration
   */
  public async upgradeTransport(
    _type: 'websocket' | 'sse' | 'http',
  ): Promise<void> {
    if (this.isClosed) {
      throw new Error('Cannot upgrade closed transport');
    }

    // Create new transport with preserved auth headers
    const requestInitWithAuth = {
      ...this.config.requestInit,
      headers: {
        ...this.config.requestInit?.headers,
        ...this.currentAuthHeaders, // Use preserved headers
      },
    };

    const newTransport = this.createSDKTransport(requestInitWithAuth);
    await this.replaceTransport(newTransport);

    // If transport was already started, start the new one
    if (this.isStarted) {
      await this.sdkTransport.start();
      this.sessionId = this.sdkTransport.sessionId;
    }
  }

  /**
   * Create SDK transport with given request init options
   */
  private createSDKTransport(
    requestInit?: RequestInit,
  ): SDKStreamableHTTPClientTransport {
    const url = new URL(this.config.url);
    const sdkOptions: StreamableHTTPClientTransportOptions = {
      requestInit,
      sessionId: this.config.sessionId,
    };

    if (this.config.reconnect) {
      sdkOptions.reconnectionOptions = {
        maxRetries: this.config.reconnect.maxAttempts,
        initialReconnectionDelay: this.config.reconnect.initialDelayMs,
        maxReconnectionDelay: this.config.reconnect.maxDelayMs,
        reconnectionDelayGrowFactor: this.config.reconnect.backoffMultiplier,
      };
    }

    return new SDKStreamableHTTPClientTransport(url, sdkOptions);
  }

  /**
   * Replace transport while preserving state and properly closing old transport
   */
  private async replaceTransport(
    newTransport: SDKStreamableHTTPClientTransport,
  ): Promise<void> {
    const oldTransport = this.sdkTransport;

    // Close old transport gracefully if it exists
    if (oldTransport) {
      try {
        await oldTransport.close();
      } catch {
        // Ignore errors during cleanup - old transport may already be closed
      }
    }

    // Replace the reference (not mutation)
    this.sdkTransport = newTransport;

    // Setup callbacks on new transport
    this.setupSDKCallbacks();
  }

  /**
   * Setup callbacks for SDK transport
   */
  private setupSDKCallbacks(): void {
    this.setupSDKCallbacksFor(this.sdkTransport);
  }

  /**
   * Setup callbacks for a specific SDK transport instance
   */
  private setupSDKCallbacksFor(
    sdkTransport: SDKStreamableHTTPClientTransport,
  ): void {
    sdkTransport.onclose = () => {
      logEvent('info', `${this.logPrefix}:sdk-closed`);
      if (this.onclose && this.isClosed) {
        this.onclose();
      }
    };

    sdkTransport.onerror = (error: Error) => {
      logEvent('error', `${this.logPrefix}:sdk-error`, {
        error: error.message,
      });
      if (this.onerror) {
        this.onerror(error);
      }
    };

    sdkTransport.onmessage = (message: JSONRPCMessage) => {
      logEvent('debug', `${this.logPrefix}:sdk-message`, {
        method: 'method' in message ? message.method : 'response',
        id: 'id' in message ? message.id : 'none',
      });
      if (this.onmessage) {
        this.onmessage(message);
      }
    };
  }

  /**
   * Validate and normalize URL
   */
  private validateAndNormalizeUrl(
    config: StreamableHTTPClientTransportConfig,
  ): void {
    if (!config.url) {
      throw new Error('URL is required for StreamableHTTP transport');
    }

    try {
      const url = new URL(config.url);
      const validProtocols = ['http:', 'https:'];
      if (!validProtocols.includes(url.protocol)) {
        throw new Error('StreamableHTTP URL must use http: or https: protocol');
      }
    } catch (error) {
      throw TransportError.connectionFailed(
        `Invalid URL format: ${error}`,
        error as Error,
      );
    }
  }
}
