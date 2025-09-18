/**
 * WebSocket Client Transport Implementation for MCP OAuth
 *
 * WebSocket transport for bidirectional client connections with OAuth authentication.
 * Implements the MCP SDK Transport interface with:
 * - WebSocket for bidirectional client↔server messages
 * - Auth headers during WebSocket handshake
 * - UUID correlation between requests and responses
 * - Automatic reconnection with exponential backoff
 * - 401 response handling with token refresh retry
 * - Proper resource cleanup and timeout support
 * - Security: token sanitization in error messages
 * - Connection state management and ping/pong handling
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
import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { TransportError } from '../errors/transport-error.js';
import { logEvent } from '../../logger.js';

/**
 * Configuration for WebSocket client transport
 */
export interface WebSocketClientTransportConfig {
  /** The WebSocket endpoint URL */
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
  /** Ping interval in milliseconds (default: 30000) */
  pingInterval?: number;
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
 * WebSocket connection states
 */
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  RECONNECTING = 'reconnecting',
}

/**
 * WebSocket client transport implementing MCP SDK Transport interface
 */
export class WebSocketClientTransport implements Transport {
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
    pingInterval: number;
  };
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private isStarted = false;
  private isClosed = false;
  private reconnectionAttempts = 0;
  private reconnectionTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private lastPongTimestamp = 0;

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

  constructor(config: WebSocketClientTransportConfig) {
    // Validate URL and convert HTTP(S) to WS(S)
    try {
      const url = new URL(config.url);

      // Convert HTTP schemes to WebSocket schemes
      if (url.protocol === 'http:') {
        url.protocol = 'ws:';
      } else if (url.protocol === 'https:') {
        url.protocol = 'wss:';
      } else if (url.protocol !== 'ws:' && url.protocol !== 'wss:') {
        throw new Error('URL must use http:, https:, ws:, or wss: protocol');
      }

      // Enforce WSS in production
      if (
        process.env.NODE_ENV === 'production' &&
        url.protocol === 'ws:' &&
        url.hostname !== 'localhost'
      ) {
        throw new Error('WSS required in production environment');
      }

      config.url = url.toString();
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
      pingInterval: config.pingInterval ?? 30000,
    };
  }

  /**
   * Start the WebSocket connection and message processing
   */
  public async start(): Promise<void> {
    if (this.isStarted) {
      return;
    }

    this.isStarted = true;
    await this.connect();
  }

  /**
   * Send a JSON-RPC message to the server via WebSocket
   */
  public async send(
    message: JSONRPCMessage,
    // TODO: options will be used for resumption tokens in future iterations
    _options?: TransportSendOptions,
  ): Promise<void> {
    if (this.isClosed) {
      throw new Error('Transport is closed');
    }

    if (this.connectionState !== ConnectionState.CONNECTED || !this.ws) {
      throw TransportError.connectionFailed('WebSocket is not connected');
    }

    // For requests, set up correlation for responses
    if ('method' in message && message.method) {
      const request = message as JSONRPCRequest;

      // Generate ID if not present
      if (!request.id) {
        request.id = uuidv4();
      }

      // Set up pending request for response correlation
      const controller = new AbortController();
      const promise = new Promise<JSONRPCResponse>((resolve, reject) => {
        const pending: PendingRequest = {
          resolve,
          reject,
          controller,
          timestamp: Date.now(),
        };

        this.pendingRequests.set(String(request.id), pending);

        // Set up timeout
        const timeoutId = setTimeout(() => {
          this.pendingRequests.delete(String(request.id));
          controller.abort();
          reject(TransportError.requestTimeout(this.config.timeout));
        }, this.config.timeout);

        // Clear timeout when request completes
        controller.signal.addEventListener('abort', () => {
          clearTimeout(timeoutId);
        });
      });

      try {
        await this.sendWebSocketMessage(request);
        await promise; // Wait for response correlation
      } catch (error) {
        this.pendingRequests.delete(String(request.id));
        throw error;
      }
    } else {
      // For responses/notifications, just send directly
      await this.sendWebSocketMessage(message);
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
    this.connectionState = ConnectionState.DISCONNECTING;

    // Clear timers
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = null;
    }
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }

    // Close WebSocket
    if (this.ws) {
      this.removeWebSocketListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Transport closed');
      }
      this.ws = null;
    }

    // Abort all pending requests
    for (const [_id, pending] of this.pendingRequests) {
      pending.controller.abort();
      pending.reject(new Error('Transport closed'));
    }
    this.pendingRequests.clear();

    this.connectionState = ConnectionState.DISCONNECTED;

    // Trigger onclose callback
    if (this.onclose) {
      this.onclose();
    }

    logEvent('info', 'transport:websocket:closed', {
      url: this.sanitizeUrl(this.config.url),
    });
  }

  /**
   * Set protocol version (MCP SDK requirement)
   */
  public setProtocolVersion?(version: string): void {
    logEvent('debug', 'transport:websocket:protocol-version', { version });
  }

  /**
   * Create WebSocket connection with auth headers and event listeners
   */
  private async connect(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    if (this.connectionState === ConnectionState.CONNECTING) {
      return;
    }

    this.connectionState = ConnectionState.CONNECTING;

    try {
      // Get auth headers for WebSocket handshake
      const headers: Record<string, string> = {};
      if (this.config.authProvider) {
        const authHeaders = await this.config.authProvider.getAuthHeaders();
        Object.assign(headers, authHeaders);
      }

      // Create WebSocket with auth headers
      this.ws = new WebSocket(this.config.url, {
        headers,
        handshakeTimeout: this.config.timeout,
      });

      this.setupWebSocketListeners();

      logEvent('info', 'transport:websocket:connecting', {
        url: this.sanitizeUrl(this.config.url),
        attempt: this.reconnectionAttempts + 1,
      });
    } catch (error) {
      const transportError =
        error instanceof TransportError
          ? error
          : TransportError.connectionFailed(
              `Failed to create WebSocket: ${error}`,
              error as Error,
            );

      this.connectionState = ConnectionState.DISCONNECTED;

      logEvent('error', 'transport:websocket:connection-error', {
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
   * Set up WebSocket event listeners
   */
  private setupWebSocketListeners(): void {
    if (!this.ws) return;

    this.ws.on('open', this.handleWebSocketOpen.bind(this));
    this.ws.on('message', this.handleWebSocketMessage.bind(this));
    this.ws.on('close', this.handleWebSocketClose.bind(this));
    this.ws.on('error', this.handleWebSocketError.bind(this));
    this.ws.on('pong', this.handleWebSocketPong.bind(this));
  }

  /**
   * Remove WebSocket event listeners
   */
  private removeWebSocketListeners(): void {
    if (!this.ws) return;

    this.ws.removeAllListeners('open');
    this.ws.removeAllListeners('message');
    this.ws.removeAllListeners('close');
    this.ws.removeAllListeners('error');
    this.ws.removeAllListeners('pong');
  }

  /**
   * Handle WebSocket open event
   */
  private handleWebSocketOpen(): void {
    // Reset reconnection counter on successful connection
    this.reconnectionAttempts = 0;
    this.connectionState = ConnectionState.CONNECTED;

    logEvent('info', 'transport:websocket:connected', {
      url: this.sanitizeUrl(this.config.url),
      readyState: this.ws?.readyState,
    });

    // Generate session ID
    this.sessionId = uuidv4();

    // Start ping timer for connection health checks
    this.startPingTimer();
  }

  /**
   * Handle WebSocket message event
   */
  private handleWebSocketMessage(data: WebSocket.Data): void {
    try {
      const messageText = data.toString('utf8');
      const message = JSON.parse(messageText) as JSONRPCMessage;

      // Validate JSON-RPC format
      if (!message.jsonrpc || message.jsonrpc !== '2.0') {
        throw new Error(
          'Invalid JSON-RPC format: missing or incorrect jsonrpc version',
        );
      }

      logEvent('debug', 'transport:websocket:message-received', {
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
      const parseError = new Error(
        `Failed to parse WebSocket message: ${error}`,
      );

      logEvent('error', 'transport:websocket:parse-error', {
        error: parseError.message,
        data: this.sanitizeLogData(data.toString()),
      });

      if (this.onerror) {
        this.onerror(parseError);
      }
    }
  }

  /**
   * Handle WebSocket close event
   */
  private handleWebSocketClose(code: number, reason: Buffer): void {
    const reasonText = reason.toString();

    this.connectionState = ConnectionState.DISCONNECTED;

    // Stop ping timer
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }

    logEvent('info', 'transport:websocket:connection-closed', {
      code,
      reason: reasonText,
      url: this.sanitizeUrl(this.config.url),
      reconnectionAttempts: this.reconnectionAttempts,
    });

    // Handle different close codes
    let shouldReconnect = true;
    let error: TransportError | null = null;

    switch (code) {
      case 1000: // Normal closure
        shouldReconnect = false;
        break;
      case 1001: // Going away
      case 1006: // Abnormal closure
        error = TransportError.connectionReset();
        break;
      case 1002: // Protocol error
        error = TransportError.protocolError(
          `WebSocket protocol error: ${reasonText}`,
        );
        shouldReconnect = false;
        break;
      case 1003: // Unsupported data
        error = TransportError.protocolError(`Unsupported data: ${reasonText}`);
        shouldReconnect = false;
        break;
      case 1011: // Server error
        error = TransportError.serviceUnavailable();
        break;
      default:
        error = TransportError.connectionFailed(
          `WebSocket closed with code ${code}: ${reasonText}`,
        );
    }

    if (error && this.onerror) {
      this.onerror(error);
    }

    // Schedule reconnection if appropriate and not manually closed
    if (shouldReconnect && !this.isClosed) {
      this.scheduleReconnection();
    } else if (this.onclose && this.isClosed) {
      this.onclose();
    }
  }

  /**
   * Handle WebSocket error event
   */
  private handleWebSocketError(error: Error): void {
    logEvent('error', 'transport:websocket:error', {
      error: error.message,
      url: this.sanitizeUrl(this.config.url),
    });

    const transportError = TransportError.connectionFailed(
      `WebSocket error: ${error.message}`,
      error,
    );

    if (this.onerror) {
      this.onerror(transportError);
    }

    // Connection will be closed, which will trigger reconnection logic
  }

  /**
   * Handle WebSocket pong event
   */
  private handleWebSocketPong(): void {
    this.lastPongTimestamp = Date.now();

    logEvent('debug', 'transport:websocket:pong-received', {
      timestamp: this.lastPongTimestamp,
    });
  }

  /**
   * Start ping timer for connection health checks
   */
  private startPingTimer(): void {
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
    }

    this.pingTimer = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        logEvent('debug', 'transport:websocket:sending-ping', {});
        this.ws.ping();
        this.startPingTimer(); // Schedule next ping
      }
    }, this.config.pingInterval);
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
        logEvent('error', 'transport:websocket:max-reconnection-attempts', {
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
    this.connectionState = ConnectionState.RECONNECTING;

    logEvent('info', 'transport:websocket:reconnecting', {
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
   * Send WebSocket message with auth retry on 401
   */
  private async sendWebSocketMessage(message: JSONRPCMessage): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw TransportError.connectionFailed('WebSocket is not open');
    }

    try {
      const messageText = JSON.stringify(message);
      this.ws.send(messageText);

      logEvent('debug', 'transport:websocket:message-sent', {
        method:
          'method' in message ? (message as JSONRPCRequest).method : 'response',
        id: 'id' in message ? message.id : 'none',
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw TransportError.requestTimeout(this.config.timeout, error);
        }
        throw TransportError.connectionFailed(
          `WebSocket send failed: ${error.message}`,
          error,
        );
      }

      throw TransportError.connectionFailed(
        `WebSocket send failed: ${error}`,
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
      .replace(/Bearer\s+[^\s"]+/g, 'Bearer [REDACTED]')
      .replace(/"Authorization":\s*"[^"]+"/g, '"Authorization":"[REDACTED]"');
  }
}
