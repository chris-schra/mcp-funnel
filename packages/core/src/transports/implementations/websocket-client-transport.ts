/**
 * WebSocket Client Transport Implementation for MCP OAuth
 *
 * WebSocket transport for bidirectional client connections with OAuth authentication.
 * Provides full-duplex communication with connection health monitoring.
 *
 * Key features:
 * - WebSocket for bidirectional client↔server messages
 * - Auth headers during WebSocket handshake
 * - UUID correlation between requests and responses
 * - Automatic reconnection with exponential backoff
 * - Connection state management and ping/pong heartbeat
 * - Proper resource cleanup and timeout support
 * - Security: token sanitization in error messages
 * @public
 * @see file:./base-client-transport.ts - Base transport implementation
 */

import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';
import { TransportError } from '../errors/transport-error.js';
import { BaseClientTransport, BaseClientTransportConfig } from './base-client-transport.js';
import { logEvent } from '../../logger.js';

/**
 * Configuration for WebSocket client transport.
 * @public
 */
export interface WebSocketClientTransportConfig extends BaseClientTransportConfig {
  /** Ping interval in milliseconds (default: 30000) */
  pingInterval?: number;
}

/**
 * WebSocket connection states.
 * @internal
 */
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
  RECONNECTING = 'reconnecting',
}

/**
 * WebSocket client transport implementing MCP SDK Transport interface.
 * @public
 */
export class WebSocketClientTransport extends BaseClientTransport {
  private readonly wsConfig: {
    pingInterval: number;
  };
  private ws: WebSocket | null = null;
  private connectionState: ConnectionState = ConnectionState.DISCONNECTED;
  private pingTimer: NodeJS.Timeout | null = null;
  private lastPongTimestamp = 0;

  public constructor(config: WebSocketClientTransportConfig) {
    super(config, 'transport:websocket');

    // WebSocket-specific configuration
    this.wsConfig = {
      pingInterval: config.pingInterval ?? 30000,
    };
  }

  // Implement abstract methods from BaseClientTransport

  /**
   * Validate and normalize URL for WebSocket
   * @param config - WebSocket transport configuration
   */
  protected validateAndNormalizeUrl(config: WebSocketClientTransportConfig): void {
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
  }

  /**
   * Create WebSocket connection
   */
  protected async connect(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    if (this.connectionState === ConnectionState.CONNECTING) {
      return;
    }

    this.connectionState = ConnectionState.CONNECTING;

    try {
      // Get auth headers for WebSocket handshake
      const headers = await this.getAuthHeaders();

      // Create WebSocket with auth headers
      this.ws = new WebSocket(this.config.url, {
        headers,
        handshakeTimeout: this.config.timeout,
      });

      this.setupWebSocketListeners();

      logEvent('info', 'transport:websocket:connecting', {
        url: this.config.url,
        attempt: this.reconnectionManager.getAttemptCount() + 1,
      });
    } catch (error) {
      this.connectionState = ConnectionState.DISCONNECTED;
      this.handleConnectionError(error as Error);
    }
  }

  /**
   * Send WebSocket message
   * @param message - JSON-RPC message to send
   */
  protected async sendMessage(message: JSONRPCMessage): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw TransportError.connectionFailed('WebSocket is not connected');
    }

    if (this.connectionState !== ConnectionState.CONNECTED) {
      throw TransportError.connectionFailed('WebSocket is not connected');
    }

    try {
      const messageText = JSON.stringify(message);
      this.ws.send(messageText);

      logEvent('debug', 'transport:websocket:message-sent', {
        method: 'method' in message ? message.method : 'response',
        id: 'id' in message ? message.id : 'none',
      });
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw TransportError.requestTimeout(this.config.timeout, error);
        }
        throw TransportError.connectionFailed(`WebSocket send failed: ${error.message}`, error);
      }

      throw TransportError.connectionFailed(`WebSocket send failed: ${error}`, error as Error);
    }
  }

  /**
   * Close WebSocket connection
   */
  protected async closeConnection(): Promise<void> {
    this.connectionState = ConnectionState.DISCONNECTING;

    // Clear ping timer
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

    this.connectionState = ConnectionState.DISCONNECTED;
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
    this.connectionState = ConnectionState.CONNECTED;

    // Call base class handler
    this.handleConnectionOpen();

    // Start ping timer for connection health checks
    this.startPingTimer();
  }

  /**
   * Handle WebSocket message event
   * @param data - Raw message data from WebSocket
   */
  private handleWebSocketMessage(data: WebSocket.Data): void {
    try {
      const messageText = data.toString('utf8');
      const message = this.parseMessage(messageText);
      this.handleMessage(message);
    } catch (_error) {
      // Error already logged by parseMessage
    }
  }

  /**
   * Handle WebSocket close event
   * @param code - WebSocket close code
   * @param reason - Close reason buffer
   */
  private handleWebSocketClose(code: number, reason: Buffer): void {
    const reasonText = reason.toString();
    this.connectionState = ConnectionState.DISCONNECTED;

    // Stop ping timer
    if (this.pingTimer) {
      clearTimeout(this.pingTimer);
      this.pingTimer = null;
    }

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
        error = TransportError.protocolError(`WebSocket protocol error: ${reasonText}`);
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

    // Call base class handler
    this.handleConnectionClose(reasonText, shouldReconnect, error || undefined);
  }

  /**
   * Handle WebSocket error event
   * @param error - Error from WebSocket
   */
  private handleWebSocketError(error: Error): void {
    const transportError = TransportError.connectionFailed(
      `WebSocket error: ${error.message}`,
      error,
    );

    this.handleConnectionError(transportError);
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
    }, this.wsConfig.pingInterval);
  }

  // Removed - this functionality is now handled by the base class ReconnectionManager

  // Removed - this functionality is now in the sendMessage() method

  // Removed - these utilities are now in the base class
}
