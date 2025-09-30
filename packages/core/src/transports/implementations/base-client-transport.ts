/**
 * Base Client Transport Implementation
 *
 * Abstract base class providing shared functionality for MCP client transports.
 * Eliminates code duplication across SSE, WebSocket, and HTTP transport implementations.
 *
 * Key responsibilities:
 * - Pending request tracking with timeout management
 * - JSON-RPC message correlation by request ID
 * - Auth provider integration with automatic header injection
 * - Reconnection management with exponential backoff
 * - Lifecycle management (start, send, close)
 * - Error handling and sanitization
 *
 * Subclasses must implement connection-specific methods:
 * - validateAndNormalizeUrl() - URL validation for transport protocol
 * - connect() - Establish connection
 * - sendMessage() - Send message over transport
 * - closeConnection() - Clean up connection resources
 * @public
 * @see file:./sse-client-transport.ts - SSE implementation
 * @see file:./websocket-client-transport.ts - WebSocket implementation
 * @see file:./streamable-http-client-transport.ts - HTTP implementation
 */

import {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
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
import { RequestUtils } from '../../utils/index.js';
import { logEvent } from '../../logger.js';
import { executeHttpRequest } from './utils/http-request.js';
import { parseMessage } from './utils/message-parser.js';

/**
 * Pending request state for JSON-RPC message correlation.
 *
 * Tracks in-flight requests awaiting responses, enabling timeout management
 * and proper promise resolution/rejection when responses arrive.
 * @public
 */
export interface PendingRequest {
  /** Promise resolve function */
  resolve: (response: JSONRPCResponse) => void;
  /** Promise reject function */
  reject: (error: Error) => void;
  /** Abort controller for timeout */
  controller: AbortController;
  /** Request timestamp for debugging */
  timestamp: number;
}

/**
 * Base configuration for client transports.
 * @public
 */
export interface BaseClientTransportConfig {
  /** The endpoint URL */
  url: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Auth provider for headers and token refresh */
  authProvider?: IAuthProvider;
  /** Reconnection configuration */
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

  /** Pending requests awaiting responses, keyed by request ID */
  protected readonly pendingRequests = new Map<string, PendingRequest>();

  // Transport interface callbacks
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (
    message: JSONRPCMessage,
    extra?: MessageExtraInfo,
  ) => void;
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
   *
   * Idempotent - multiple calls are safe but only the first takes effect.
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
   *
   * For requests (messages with method), generates request ID if missing and creates
   * a promise that resolves when the response arrives or rejects on timeout.
   * For responses/notifications, sends immediately without correlation.
   * @param message - JSON-RPC message to send
   * @param _options - Transport send options (currently unused)
   * @throws \{Error\} When transport is closed
   * @throws \{Error\} When request times out after configured timeout
   * @public
   */
  public async send(
    message: JSONRPCMessage,
    _options?: TransportSendOptions,
  ): Promise<void> {
    if (this.isClosed) {
      throw new Error('Transport is closed');
    }

    // For requests, set up ID generation and correlation tracking
    if ('method' in message && message.method) {
      const request = message as JSONRPCRequest;

      // Generate ID if not present
      if (!request.id) {
        request.id = RequestUtils.generateRequestId();
      }

      // Create promise for response correlation
      return new Promise<void>((resolve, reject) => {
        const controller = new AbortController();

        const timeoutId = setTimeout(() => {
          this.pendingRequests.delete(String(request.id));
          controller.abort();
          reject(new Error(`Request timeout after ${this.config.timeout}ms`));
        }, this.config.timeout);

        const pending: PendingRequest = {
          resolve: (_response: JSONRPCResponse) => {
            clearTimeout(timeoutId);
            resolve();
          },
          reject: (error: Error) => {
            clearTimeout(timeoutId);
            reject(error);
          },
          controller,
          timestamp: Date.now(),
        };

        this.pendingRequests.set(String(request.id), pending);

        // Send the message
        this.sendMessage(request).catch((error) => {
          this.pendingRequests.delete(String(request.id));
          clearTimeout(timeoutId);
          reject(error);
        });
      });
    } else {
      // For responses/notifications, just send directly
      await this.sendMessage(message);
    }
  }

  /**
   * Closes the transport and cleans up all resources.
   *
   * Cancels reconnection attempts, closes connection, aborts pending requests,
   * and triggers the onclose callback. Idempotent - safe to call multiple times.
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
    for (const [_id, pending] of this.pendingRequests) {
      pending.controller.abort();
      pending.reject(new Error('Transport closed'));
    }
    this.pendingRequests.clear();

    // Trigger onclose callback
    if (this.onclose) {
      this.onclose();
    }

    logEvent('info', `${this.logPrefix}:closed`, {
      url: this.config.url,
    });
  }

  /**
   * Sets the MCP protocol version.
   *
   * Called by MCP SDK after protocol negotiation during initialization.
   * @param version - Protocol version string (e.g., "1.0")
   * @public
   */
  public setProtocolVersion?(version: string): void {
    logEvent('debug', `${this.logPrefix}:protocol-version`, { version });
  }

  /**
   * Handles successful connection establishment.
   *
   * Resets reconnection counter and generates session ID.
   * Called by subclass when connection is established.
   * @internal
   */
  protected handleConnectionOpen(): void {
    // Reset reconnection counter on successful connection
    this.reconnectionManager.reset();

    logEvent('info', `${this.logPrefix}:connected`, {
      url: this.config.url,
    });

    // Generate session ID
    this.sessionId = RequestUtils.generateSessionId();
  }

  /**
   * Handles received JSON-RPC messages with automatic response correlation.
   *
   * For messages with an ID, attempts to match with pending requests and
   * resolve/reject the corresponding promise. Always forwards to onmessage callback.
   * @param message - Received JSON-RPC message
   * @internal
   */
  protected handleMessage(message: JSONRPCMessage): void {
    logEvent('debug', `${this.logPrefix}:message-received`, {
      id: 'id' in message ? message.id : 'none',
      method: 'method' in message ? message.method : 'none',
    });

    // Handle response correlation
    if ('id' in message && message.id !== null && message.id !== undefined) {
      const pending = this.pendingRequests.get(String(message.id));
      if (pending) {
        this.pendingRequests.delete(String(message.id));

        if ('error' in message && message.error) {
          // JSON-RPC error response
          const errorMessage =
            message.error.message || 'Unknown JSON-RPC error';
          const errorCode = message.error.code || -1;
          pending.reject(
            new Error(`JSON-RPC error ${errorCode}: ${errorMessage}`),
          );
        } else {
          // Successful response
          pending.resolve(message as JSONRPCResponse);
        }
      }
    }

    // Always forward to onmessage callback
    if (this.onmessage) {
      this.onmessage(message);
    }
  }

  /**
   * Handles connection errors with automatic retry for retryable errors.
   *
   * Converts errors to TransportError if needed, logs the error, triggers
   * onerror callback, and schedules reconnection if the error is retryable.
   * @param error - Error that occurred
   * @internal
   */
  protected handleConnectionError(error: Error): void {
    const transportError =
      error instanceof TransportError
        ? error
        : TransportError.connectionFailed(
            `Connection error: ${error.message}`,
            error,
          );

    logEvent('error', `${this.logPrefix}:connection-error`, {
      error: transportError.message,
      code: transportError.code,
    });

    if (this.onerror) {
      this.onerror(transportError);
    }

    // Attempt reconnection if retryable
    if (transportError.isRetryable && !this.isClosed) {
      this.reconnectionManager.scheduleReconnection(() => this.connect());
    }
  }

  /**
   * Handles connection close with optional reconnection scheduling.
   *
   * Logs the closure, triggers onerror callback if error provided, and schedules
   * reconnection if appropriate and not manually closed.
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
    logEvent('info', `${this.logPrefix}:connection-closed`, {
      reason: reason || 'none',
      url: this.config.url,
      reconnectionAttempts: this.reconnectionManager.getAttemptCount(),
    });

    if (error && this.onerror) {
      this.onerror(error);
    }

    // Schedule reconnection if appropriate and not manually closed
    if (shouldReconnect && !this.isClosed) {
      this.reconnectionManager.scheduleReconnection(() => this.connect());
    } else if (this.onclose && this.isClosed) {
      this.onclose();
    }
  }

  /**
   * Gets authentication headers from the configured auth provider.
   * @returns Auth headers object (empty if no provider configured)
   * @throws \{TransportError\} When authentication fails
   * @internal
   */
  protected async getAuthHeaders(): Promise<Record<string, string>> {
    if (!this.config.authProvider) {
      return {};
    }

    try {
      return await this.config.authProvider.getHeaders();
    } catch (error) {
      logEvent('error', `${this.logPrefix}:auth-error`, {
        error: String(error),
      });
      throw TransportError.connectionFailed(
        `Authentication failed: ${error}`,
        error as Error,
      );
    }
  }

  /**
   * Executes HTTP POST request with auth headers, 401 handling, and retry logic.
   *
   * Delegates to shared utility function that handles token refresh on 401.
   * @param message - JSON-RPC message to send
   * @param signal - AbortSignal for timeout control
   * @returns Promise that resolves when request completes successfully
   * @throws \{TransportError\} When request fails
   * @internal
   */
  protected async executeHttpRequest(
    message: JSONRPCMessage,
    signal: AbortSignal,
  ): Promise<void> {
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
   *
   * Delegates to shared utility that validates JSON-RPC structure.
   * @param data - Raw message string
   * @returns Parsed JSON-RPC message
   * @throws \{Error\} When parsing or validation fails
   * @internal
   */
  protected parseMessage(data: string): JSONRPCMessage {
    return parseMessage(data, this.logPrefix, this.onerror);
  }

  /**
   * Validates and normalizes the URL for the specific transport protocol.
   *
   * Subclasses should enforce protocol requirements (e.g., WSS in production)
   * and throw TransportError.invalidUrl() if validation fails.
   * @param config - Transport configuration containing URL
   * @throws \{TransportError\} When URL is invalid for this transport
   * @internal
   */
  protected abstract validateAndNormalizeUrl(
    config: BaseClientTransportConfig,
  ): void;

  /**
   * Establishes the transport connection.
   *
   * Called by start() after ensuring transport is not already started.
   * Should set up connection and event handlers.
   * @throws \{TransportError\} When connection fails
   * @internal
   */
  protected abstract connect(): Promise<void>;

  /**
   * Sends a message over the established connection.
   *
   * Called by send() after handling request correlation setup.
   * Should transmit the message using the transport protocol.
   * @param message - JSON-RPC message to send
   * @throws \{TransportError\} When send fails
   * @internal
   */
  protected abstract sendMessage(message: JSONRPCMessage): Promise<void>;

  /**
   * Closes the underlying connection and cleans up resources.
   *
   * Called by close() after handling pending requests.
   * Should remove event listeners and close connections.
   * @internal
   */
  protected abstract closeConnection(): Promise<void>;
}
