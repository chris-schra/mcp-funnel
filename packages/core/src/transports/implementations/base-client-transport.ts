/**
 * Base Client Transport Implementation
 *
 * Shared functionality for client transports to eliminate DRY violations.
 * Contains common logic for:
 * - Pending request management
 * - Message correlation
 * - Auth provider integration
 * - Reconnection management
 * - Data sanitization
 * - Lifecycle management
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
 * Pending request state for message correlation
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
 * Base configuration for client transports
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
 * Base transport class with shared functionality
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
   * Start the transport connection and message processing
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    await this.connect();
  }

  /**
   * Send a JSON-RPC message to the server
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
   * Close the transport and clean up resources
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
   * Set protocol version (MCP SDK requirement)
   */
  public setProtocolVersion?(version: string): void {
    logEvent('debug', `${this.logPrefix}:protocol-version`, { version });
  }

  /**
   * Handle successful connection
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
   * Handle received message from connection
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
   * Handle connection error
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
   * Handle connection close
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
   * Get auth headers if auth provider is configured
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
   * Execute HTTP request with auth headers, 401 handling, and retry logic
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
   * Parse message with error handling
   */
  protected parseMessage(data: string): JSONRPCMessage {
    return parseMessage(data, this.logPrefix, this.onerror);
  }

  // Abstract methods that subclasses must implement
  protected abstract validateAndNormalizeUrl(
    config: BaseClientTransportConfig,
  ): void;

  protected abstract connect(): Promise<void>;

  protected abstract sendMessage(message: JSONRPCMessage): Promise<void>;

  protected abstract closeConnection(): Promise<void>;
}
