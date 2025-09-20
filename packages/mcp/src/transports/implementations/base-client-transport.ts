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
import { logEvent } from '../../logger.js';
import {
  ReconnectionManager,
  ReconnectionConfig,
  AuthProvider,
  generateRequestId,
  generateSessionId,
  sanitizeUrl,
  sanitizeLogData,
  applyReconnectionDefaults,
} from '../utils/transport-utils.js';

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
  authProvider?: AuthProvider;
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
    authProvider?: AuthProvider;
    reconnect: ReconnectionConfig;
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

  constructor(
    config: BaseClientTransportConfig,
    protected readonly logPrefix: string,
  ) {
    this.validateAndNormalizeUrl(config);

    // Apply default configuration values
    this.config = {
      url: config.url,
      timeout: config.timeout ?? 30000,
      authProvider: config.authProvider,
      reconnect: applyReconnectionDefaults(config.reconnect),
    };

    // Create reconnection manager
    this.reconnectionManager = new ReconnectionManager(
      this.config.reconnect,
      () => this.connect(),
      () => {
        if (this.onclose) {
          this.onclose();
        }
      },
      this.logPrefix,
    );
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
        request.id = generateRequestId();
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
      url: sanitizeUrl(this.config.url),
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
      url: sanitizeUrl(this.config.url),
    });

    // Generate session ID
    this.sessionId = generateSessionId();
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
      this.reconnectionManager.scheduleReconnection();
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
      url: sanitizeUrl(this.config.url),
      reconnectionAttempts: this.reconnectionManager.getAttemptCount(),
    });

    if (error && this.onerror) {
      this.onerror(error);
    }

    // Schedule reconnection if appropriate and not manually closed
    if (shouldReconnect && !this.isClosed) {
      this.reconnectionManager.scheduleReconnection();
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
      return await this.config.authProvider.getAuthHeaders();
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
    const isRequest = 'method' in message;

    try {
      // Get auth headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (this.config.authProvider) {
        const authHeaders = await this.config.authProvider.getAuthHeaders();
        Object.assign(headers, authHeaders);
      }

      // Send HTTP POST request
      const response = await fetch(this.config.url, {
        method: 'POST',
        headers,
        body: JSON.stringify(message),
        signal,
      });

      // Handle HTTP errors
      if (!response.ok) {
        // Special handling for 401 Unauthorized
        if (
          response.status === 401 &&
          this.config.authProvider?.refreshToken &&
          isRequest
        ) {
          try {
            await this.config.authProvider.refreshToken();
            // Retry with refreshed token
            const retryHeaders = {
              'Content-Type': 'application/json',
              ...(await this.config.authProvider.getAuthHeaders()),
            };

            const retryResponse = await fetch(this.config.url, {
              method: 'POST',
              headers: retryHeaders,
              body: JSON.stringify(message),
              signal,
            });

            if (!retryResponse.ok) {
              throw TransportError.fromHttpStatus(
                retryResponse.status,
                retryResponse.statusText,
              );
            }
            return;
          } catch (refreshError) {
            logEvent('error', `${this.logPrefix}:token-refresh-failed`, {
              error: String(refreshError),
            });
            throw TransportError.fromHttpStatus(401, 'Token refresh failed');
          }
        }

        throw TransportError.fromHttpStatus(
          response.status,
          response.statusText,
        );
      }

      logEvent('debug', `${this.logPrefix}:http-request-sent`, {
        method: isRequest ? (message as JSONRPCRequest).method : 'response',
        id: 'id' in message ? message.id : 'none',
      });
    } catch (error) {
      if (error instanceof TransportError) {
        throw error;
      }

      // Handle network errors
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw TransportError.requestTimeout(this.config.timeout, error);
        }
        if (error.message.includes('fetch')) {
          throw TransportError.connectionFailed(
            `Network error: ${error.message}`,
            error,
          );
        }
      }

      throw TransportError.connectionFailed(
        `HTTP request failed: ${error}`,
        error as Error,
      );
    }
  }

  /**
   * Parse message with error handling
   */
  protected parseMessage(data: string): JSONRPCMessage {
    try {
      const message = JSON.parse(data) as JSONRPCMessage;

      // Validate JSON-RPC format
      if (!message.jsonrpc || message.jsonrpc !== '2.0') {
        throw new Error(
          'Invalid JSON-RPC format: missing or incorrect jsonrpc version',
        );
      }

      return message;
    } catch (error) {
      const parseError = new Error(`Failed to parse message: ${error}`);

      logEvent('error', `${this.logPrefix}:parse-error`, {
        error: parseError.message,
        data: sanitizeLogData(data),
      });

      if (this.onerror) {
        this.onerror(parseError);
      }

      throw parseError;
    }
  }

  /**
   * Utility methods for subclasses
   */
  protected sanitizeUrl(url: string): string {
    return sanitizeUrl(url);
  }

  protected sanitizeLogData(data: string): string {
    return sanitizeLogData(data);
  }

  // Abstract methods that subclasses must implement
  protected abstract validateAndNormalizeUrl(
    config: BaseClientTransportConfig,
  ): void;
  protected abstract connect(): Promise<void>;
  protected abstract sendMessage(message: JSONRPCMessage): Promise<void>;
  protected abstract closeConnection(): Promise<void>;
}
