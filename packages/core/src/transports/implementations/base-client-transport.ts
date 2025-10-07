/**
 * Base Client Transport Implementation
 *
 * Abstract base class providing shared functionality for MCP client transports.
 * Handles request tracking, message correlation, auth, reconnection, and lifecycle.
 * @public
 */

import { Transport, TransportSendOptions } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
  MessageExtraInfo,
} from '@modelcontextprotocol/sdk/types.js';
import { TransportError } from '../errors/transport-error.js';

import type { ReconnectionConfig } from '@mcp-funnel/models';
import { ReconnectionManager } from '../../reconnection-manager/index.js';
import type { IAuthProvider } from '../../auth/index.js';
import { logEvent } from '../../logger.js';
import { executeHttpRequest } from './utils/http-request.js';
import { parseMessage } from './utils/message-parser.js';
import {
  handleConnectionOpen as handleConnectionOpenUtil,
  handleMessage as handleMessageUtil,
  handleConnectionError as handleConnectionErrorUtil,
  handleConnectionClose as handleConnectionCloseUtil,
  type ConnectionLifecycleContext,
} from './utils/connection-lifecycle.js';
import { getAuthHeaders as getAuthHeadersUtil } from './utils/auth-helpers.js';
import { setupRequestCorrelation } from './utils/request-correlation.js';
import { cleanupPendingRequests, logTransportClosure } from './utils/cleanup-helpers.js';

/**
 * Pending request state for JSON-RPC message correlation.
 * @public
 */
export interface PendingRequest {
  resolve: (response: JSONRPCResponse) => void;
  reject: (error: Error) => void;
  controller: AbortController;
  timestamp: number;
}

/**
 * Base configuration for client transports.
 * @public
 */
export interface BaseClientTransportConfig {
  url: string;
  timeout?: number;
  authProvider?: IAuthProvider;
  reconnect?: Partial<ReconnectionConfig>;
}

/**
 * Base transport class with shared functionality for MCP client transports.
 * @public
 */
export abstract class BaseClientTransport implements Transport {
  protected readonly config: {
    url: string;
    timeout: number;
    authProvider?: IAuthProvider;
    reconnect: Partial<ReconnectionConfig>;
  };

  protected isStarted = false;
  protected isClosed = false;
  protected reconnectionManager: ReconnectionManager;

  protected readonly pendingRequests = new Map<string, PendingRequest>();
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: JSONRPCMessage, extra?: MessageExtraInfo) => void;
  public sessionId?: string;

  public constructor(
    config: BaseClientTransportConfig,
    protected readonly logPrefix: string,
  ) {
    this.validateAndNormalizeUrl(config);

    // Apply default configuration values
    this.config = {
      url: config.url,
      timeout: config.timeout ?? 30000,
      authProvider: config.authProvider,
      reconnect: config.reconnect ?? {},
    };

    // Create reconnection manager
    this.reconnectionManager = new ReconnectionManager(this.config.reconnect);

    // Set up state change handler for max attempts
    this.reconnectionManager.onStateChange((event) => {
      if (event.to === 'failed' && this.onclose) {
        this.onclose();
      }
    });
  }

  /**
   * Starts the transport connection and enables message processing.
   * @throws \{TransportError\} When connection fails
   * @public
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }
    this.isStarted = true;
    await this.connect();
  }

  /**
   * Sends a JSON-RPC message to the server with automatic ID generation and timeout handling.
   * @param message - JSON-RPC message to send
   * @param _options - Transport send options (currently unused)
   * @returns Promise that resolves when message sent
   * @throws \{Error\} When transport is closed or timeout occurs
   * @public
   */
  public async send(message: JSONRPCMessage, _options?: TransportSendOptions): Promise<void> {
    if (this.isClosed) {
      throw new Error('Transport is closed');
    }

    // For requests, set up ID generation and correlation tracking
    if ('method' in message && message.method) {
      const request = message as JSONRPCRequest;
      return setupRequestCorrelation(request, this.pendingRequests, this.config.timeout, (msg) =>
        this.sendMessage(msg),
      );
    } else {
      // For responses/notifications, just send directly
      await this.sendMessage(message);
    }
  }

  /**
   * Closes the transport and cleans up all resources.
   * @public
   */
  public async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    this.isStarted = false;

    // Cancel reconnection
    this.reconnectionManager.cancel();

    // Close connection
    await this.closeConnection();

    // Abort all pending requests
    cleanupPendingRequests(this.pendingRequests);

    // Trigger onclose callback
    if (this.onclose) {
      this.onclose();
    }

    logTransportClosure(this.logPrefix, this.config.url);
  }

  /**
   * Sets the MCP protocol version.
   * @param version - Protocol version string (e.g., "1.0")
   * @public
   */
  public setProtocolVersion?(version: string): void {
    logEvent('debug', `${this.logPrefix}:protocol-version`, { version });
  }

  /**
   * Handles successful connection establishment.
   * @internal
   */
  protected handleConnectionOpen(): void {
    handleConnectionOpenUtil(this.getLifecycleContext());
  }

  /**
   * Handles received JSON-RPC messages with automatic response correlation.
   * @param message - Received JSON-RPC message
   * @internal
   */
  protected handleMessage(message: JSONRPCMessage): void {
    handleMessageUtil(message, this.getLifecycleContext());
  }

  /**
   * Handles connection errors with automatic retry for retryable errors.
   * @param error - Error that occurred
   * @internal
   */
  protected handleConnectionError(error: Error): void {
    handleConnectionErrorUtil(error, this.getLifecycleContext());
  }

  /**
   * Handles connection close with optional reconnection scheduling.
   * @param reason - Optional close reason string
   * @param shouldReconnect - Whether to attempt reconnection
   * @param error - Optional error that caused the closure
   * @internal
   */
  protected handleConnectionClose(
    reason?: string,
    shouldReconnect = true,
    error?: TransportError,
  ): void {
    handleConnectionCloseUtil(reason, shouldReconnect, error, this.getLifecycleContext());
  }

  /**
   * Creates lifecycle context for utility functions.
   * @returns Connection lifecycle context
   * @internal
   */
  private getLifecycleContext(): ConnectionLifecycleContext {
    return {
      logPrefix: this.logPrefix,
      url: this.config.url,
      pendingRequests: this.pendingRequests,
      reconnectionManager: this.reconnectionManager,
      isClosed: this.isClosed,
      onmessage: this.onmessage,
      onerror: this.onerror,
      onclose: this.onclose,
      setSessionId: (id: string) => {
        this.sessionId = id;
      },
      connect: () => this.connect(),
    };
  }

  /**
   * Gets authentication headers from the configured auth provider.
   * @returns Auth headers object (empty if no provider configured)
   * @internal
   */
  protected async getAuthHeaders(): Promise<Record<string, string>> {
    return getAuthHeadersUtil(this.config.authProvider, this.logPrefix);
  }

  /**
   * Executes HTTP POST request with auth headers, 401 handling, and retry logic.
   * @param message - JSON-RPC message to send
   * @param signal - AbortSignal for timeout control
   * @returns Promise that resolves when request completes successfully
   * @internal
   */
  protected async executeHttpRequest(message: JSONRPCMessage, signal: AbortSignal): Promise<void> {
    return executeHttpRequest(
      this.config.url,
      message,
      signal,
      this.config.timeout,
      this.logPrefix,
      this.config.authProvider,
    );
  }

  /**
   * Parses JSON-RPC message with error handling and logging.
   * @param data - Raw message string
   * @returns Parsed JSON-RPC message
   * @internal
   */
  protected parseMessage(data: string): JSONRPCMessage {
    return parseMessage(data, this.logPrefix, this.onerror);
  }

  /** @internal */
  protected abstract validateAndNormalizeUrl(config: BaseClientTransportConfig): void;

  /** @internal */
  protected abstract connect(): Promise<void>;

  /** @internal */
  protected abstract sendMessage(message: JSONRPCMessage): Promise<void>;

  /** @internal */
  protected abstract closeConnection(): Promise<void>;
}
