/**
 * SSE Client Transport Implementation for MCP OAuth
 *
 * Server-Sent Events (SSE) transport for client connections with OAuth authentication.
 * Implements the MCP SDK Transport interface with:
 * - EventSource for server→client messages (SSE stream)
 * - HTTP POST for client→server messages with auth headers
 * - UUID correlation between requests and responses
 * - Auth token as query parameter (EventSource browser limitation)
 * - Automatic reconnection with exponential backoff
 * - 401 response handling with token refresh retry
 * - Proper resource cleanup and timeout support
 * - Security: token sanitization in error messages
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
import { EventSource } from 'eventsource';
import { v4 as uuidv4 } from 'uuid';
import {
  TransportError,
  // TODO: TransportErrorCode used for error mapping - Phase 3 requirement
  TransportErrorCode as _TransportErrorCode,
} from '../errors/transport-error.js';
import { logEvent } from '../../logger.js';

/**
 * Configuration for SSE client transport
 */
export interface SSEClientTransportConfig {
  /** The SSE endpoint URL */
  url: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Auth provider for headers and token refresh */
  authProvider?: {
    /** Get current auth headers */
    getAuthHeaders(): Promise<Record<string, string>>;
    /** Refresh auth token (optional, for 401 recovery) */
    refreshToken?(): Promise<void>;
  };
  /** Reconnection configuration */
  reconnect?: {
    /** Maximum reconnection attempts (default: 5) */
    maxAttempts?: number;
    /** Initial delay in ms (default: 1000) */
    initialDelayMs?: number;
    /** Backoff multiplier (default: 2) */
    backoffMultiplier?: number;
    /** Maximum delay cap in ms (default: 16000) */
    maxDelayMs?: number;
  };
}

/**
 * Pending request state for message correlation
 */
interface PendingRequest {
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
 * SSE client transport implementing MCP SDK Transport interface
 */
export class SSEClientTransport implements Transport {
  private readonly config: {
    url: string;
    timeout: number;
    authProvider?: {
      getAuthHeaders(): Promise<Record<string, string>>;
      refreshToken?(): Promise<void>;
    };
    reconnect: {
      maxAttempts: number;
      initialDelayMs: number;
      backoffMultiplier: number;
      maxDelayMs: number;
    };
  };
  private eventSource: EventSource | null = null;
  private isStarted = false;
  private isClosed = false;
  private reconnectionAttempts = 0;
  private reconnectionTimer: NodeJS.Timeout | null = null;

  /** Pending requests awaiting responses, keyed by request ID */
  private readonly pendingRequests = new Map<string, PendingRequest>();

  // Transport interface callbacks
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (
    message: JSONRPCMessage,
    extra?: MessageExtraInfo,
  ) => void;
  public sessionId?: string;

  constructor(config: SSEClientTransportConfig) {
    // Validate URL
    try {
      const url = new URL(config.url);

      // Enforce HTTPS in production
      if (
        process.env.NODE_ENV === 'production' &&
        url.protocol === 'http:' &&
        url.hostname !== 'localhost'
      ) {
        throw new Error('HTTPS required in production environment');
      }
    } catch (error) {
      throw TransportError.invalidUrl(config.url, error as Error);
    }

    // Apply default configuration values
    this.config = {
      url: config.url,
      timeout: config.timeout ?? 30000,
      authProvider: config.authProvider,
      reconnect: {
        maxAttempts: config.reconnect?.maxAttempts ?? 5,
        initialDelayMs: config.reconnect?.initialDelayMs ?? 1000,
        backoffMultiplier: config.reconnect?.backoffMultiplier ?? 2,
        maxDelayMs: config.reconnect?.maxDelayMs ?? 16000,
      },
    };
  }

  /**
   * Start the SSE connection and message processing
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    await this.connect();
  }

  /**
   * Send a JSON-RPC message to the server via HTTP POST
   */
  public async send(
    message: JSONRPCMessage,
    // TODO: options will be used for resumption tokens in future iterations
    _options?: TransportSendOptions,
  ): Promise<void> {
    if (this.isClosed) {
      throw new Error('Transport is closed');
    }

    // For requests, set up correlation and return a promise that resolves with the response
    if ('method' in message && message.method) {
      const request = message as JSONRPCRequest;

      // Generate ID if not present
      if (!request.id) {
        request.id = uuidv4();
      }

      // Set up pending request for response correlation
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, this.config.timeout);

      try {
        await this.sendHttpRequest(request, controller.signal);
        clearTimeout(timeoutId);
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingRequests.delete(String(request.id));
        throw error;
      }
    } else {
      // For responses/notifications, just send via HTTP
      await this.sendHttpRequest(
        message,
        AbortSignal.timeout(this.config.timeout),
      );
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

    // Clear reconnection timer
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }

    // Close EventSource
    if (this.eventSource) {
      this.removeEventSourceListeners();
      this.eventSource.close();
      this.eventSource = null;
    }

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

    logEvent('info', 'transport:sse:closed', {
      url: this.sanitizeUrl(this.config.url),
    });
  }

  /**
   * Set protocol version (MCP SDK requirement)
   */
  public setProtocolVersion?(version: string): void {
    logEvent('debug', 'transport:sse:protocol-version', { version });
  }

  /**
   * Finish OAuth authorization (placeholder for future implementation)
   */
  public async finishAuth(_code: string, _state: string): Promise<void> {
    throw new Error(
      'OAuth authorization code flow not implemented in MVP - use client credentials flow',
    );
  }

  /**
   * Create EventSource connection with auth and event listeners
   */
  private async connect(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    try {
      // Build URL with auth token as query parameter (EventSource limitation)
      const url = await this.buildAuthenticatedUrl();

      // Create EventSource
      this.eventSource = new EventSource(url, {
        withCredentials: false,
      });

      this.setupEventSourceListeners();

      logEvent('info', 'transport:sse:connecting', {
        url: this.sanitizeUrl(this.config.url),
        attempt: this.reconnectionAttempts + 1,
      });
    } catch (error) {
      const transportError =
        error instanceof TransportError
          ? error
          : TransportError.connectionFailed(
              `Failed to create EventSource: ${error}`,
              error as Error,
            );

      logEvent('error', 'transport:sse:connection-error', {
        error: transportError.message,
        code: transportError.code,
      });

      if (this.onerror) {
        this.onerror(transportError);
      }

      // Attempt reconnection if retryable
      if (transportError.isRetryable) {
        this.scheduleReconnection();
      }
    }
  }

  /**
   * Build URL with auth token as query parameter
   */
  private async buildAuthenticatedUrl(): Promise<string> {
    const url = new URL(this.config.url);

    if (this.config.authProvider) {
      try {
        const headers = await this.config.authProvider.getAuthHeaders();
        const authHeader = headers.Authorization || headers.authorization;

        if (authHeader) {
          // Add auth token as query param due to EventSource browser limitation
          url.searchParams.set('auth', encodeURIComponent(authHeader));
        }
      } catch (error) {
        logEvent('error', 'transport:sse:auth-error', { error: String(error) });
        throw TransportError.connectionFailed(
          `Authentication failed: ${error}`,
          error as Error,
        );
      }
    }

    return url.toString();
  }

  /**
   * Set up EventSource event listeners
   */
  private setupEventSourceListeners(): void {
    if (!this.eventSource) return;

    this.eventSource.addEventListener(
      'open',
      this.handleEventSourceOpen.bind(this),
    );
    this.eventSource.addEventListener(
      'message',
      this.handleEventSourceMessage.bind(this),
    );
    this.eventSource.addEventListener(
      'error',
      this.handleEventSourceError.bind(this),
    );
  }

  /**
   * Remove EventSource event listeners
   */
  private removeEventSourceListeners(): void {
    if (!this.eventSource) return;

    this.eventSource.removeEventListener(
      'open',
      this.handleEventSourceOpen.bind(this),
    );
    this.eventSource.removeEventListener(
      'message',
      this.handleEventSourceMessage.bind(this),
    );
    this.eventSource.removeEventListener(
      'error',
      this.handleEventSourceError.bind(this),
    );
  }

  /**
   * Handle EventSource open event
   */
  private handleEventSourceOpen(): void {
    // Reset reconnection counter on successful connection
    this.reconnectionAttempts = 0;

    logEvent('info', 'transport:sse:connected', {
      url: this.sanitizeUrl(this.config.url),
      readyState: this.eventSource?.readyState,
    });

    // Generate session ID
    this.sessionId = uuidv4();
  }

  /**
   * Handle EventSource message event
   */
  private handleEventSourceMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as JSONRPCMessage;

      // Validate JSON-RPC format
      if (!message.jsonrpc || message.jsonrpc !== '2.0') {
        throw new Error(
          'Invalid JSON-RPC format: missing or incorrect jsonrpc version',
        );
      }

      logEvent('debug', 'transport:sse:message-received', {
        id: 'id' in message ? message.id : 'none',
        method: 'method' in message ? message.method : 'none',
      });

      // Check for response correlation
      if ('id' in message && message.id !== null && message.id !== undefined) {
        const pending = this.pendingRequests.get(String(message.id));
        if (pending) {
          this.pendingRequests.delete(String(message.id));

          if ('error' in message) {
            pending.reject(
              new Error(`JSON-RPC error: ${JSON.stringify(message.error)}`),
            );
          } else {
            pending.resolve(message as JSONRPCResponse);
          }
          return;
        }
      }

      // Forward to onmessage callback if not correlated
      if (this.onmessage) {
        this.onmessage(message);
      }
    } catch (error) {
      const parseError = new Error(`Failed to parse SSE message: ${error}`);

      logEvent('error', 'transport:sse:parse-error', {
        error: parseError.message,
        data: this.sanitizeLogData(event.data),
      });

      if (this.onerror) {
        this.onerror(parseError);
      }
    }
  }

  /**
   * Handle EventSource error event
   */
  private handleEventSourceError(): void {
    const readyState = this.eventSource?.readyState ?? -1;

    logEvent('error', 'transport:sse:connection-error', {
      readyState,
      url: this.sanitizeUrl(this.config.url),
      reconnectionAttempts: this.reconnectionAttempts,
    });

    const error = TransportError.connectionFailed(
      `EventSource connection failed (readyState: ${readyState})`,
    );

    if (this.onerror) {
      this.onerror(error);
    }

    // Schedule reconnection if we haven't exceeded max attempts
    this.scheduleReconnection();
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnection(): void {
    if (
      this.isClosed ||
      this.reconnectionAttempts >= this.config.reconnect.maxAttempts
    ) {
      if (this.reconnectionAttempts >= this.config.reconnect.maxAttempts) {
        logEvent('error', 'transport:sse:max-reconnection-attempts', {
          maxAttempts: this.config.reconnect.maxAttempts,
        });

        if (this.onclose) {
          this.onclose();
        }
      }
      return;
    }

    // Calculate exponential backoff delay
    const baseDelay = this.config.reconnect.initialDelayMs;
    const multiplier = Math.pow(
      this.config.reconnect.backoffMultiplier,
      this.reconnectionAttempts,
    );
    const delay = Math.min(
      baseDelay * multiplier,
      this.config.reconnect.maxDelayMs,
    );

    this.reconnectionAttempts++;

    logEvent('info', 'transport:sse:reconnecting', {
      attempt: this.reconnectionAttempts,
      delay,
      maxAttempts: this.config.reconnect.maxAttempts,
    });

    this.reconnectionTimer = setTimeout(() => {
      this.reconnectionTimer = null;
      if (!this.isClosed) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Send HTTP POST request to server
   */
  private async sendHttpRequest(
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
            logEvent('error', 'transport:sse:token-refresh-failed', {
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

      logEvent('debug', 'transport:sse:http-request-sent', {
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
   * Sanitize URL for logging (remove auth tokens)
   */
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      if (urlObj.searchParams.has('auth')) {
        urlObj.searchParams.set('auth', '[REDACTED]');
      }
      return urlObj.toString();
    } catch {
      return '[INVALID_URL]';
    }
  }

  /**
   * Sanitize log data (remove tokens)
   */
  private sanitizeLogData(data: string): string {
    if (typeof data !== 'string') return '[NON_STRING_DATA]';

    // Replace potential tokens in JSON strings
    return data
      .replace(/"auth":\s*"[^"]+"/g, '"auth":"[REDACTED]"')
      .replace(/Bearer\s+[^\s"]+/g, 'Bearer [REDACTED]');
  }
}
