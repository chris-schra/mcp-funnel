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
  JSONRPCMessage,
  JSONRPCRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { EventSource } from 'eventsource';
import {
  TransportError,
  // TODO: TransportErrorCode used for error mapping - Phase 3 requirement
  TransportErrorCode as _TransportErrorCode,
} from '../errors/transport-error.js';
import { logEvent } from '../../logger.js';
import {
  BaseClientTransport,
  BaseClientTransportConfig,
} from './base-client-transport.js';

/**
 * Configuration for SSE client transport
 */
export type SSEClientTransportConfig = BaseClientTransportConfig;

// Removed - PendingRequest interface is now in base class

/**
 * SSE client transport implementing MCP SDK Transport interface
 */
export class SSEClientTransport extends BaseClientTransport {
  private eventSource: EventSource | null = null;

  constructor(config: SSEClientTransportConfig) {
    super(config, 'transport:sse');
  }

  // Implement abstract methods from BaseClientTransport

  /**
   * Validate and normalize URL for SSE
   */
  protected validateAndNormalizeUrl(config: SSEClientTransportConfig): void {
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
  }

  /**
   * Create EventSource connection
   */
  protected async connect(): Promise<void> {
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
        attempt: this.reconnectionManager.getAttemptCount() + 1,
      });
    } catch (error) {
      this.handleConnectionError(error as Error);
    }
  }

  /**
   * Send message via HTTP POST
   */
  protected async sendMessage(message: JSONRPCMessage): Promise<void> {
    await this.sendHttpRequest(
      message,
      AbortSignal.timeout(this.config.timeout),
    );
  }

  /**
   * Close EventSource connection
   */
  protected async closeConnection(): Promise<void> {
    // Close EventSource
    if (this.eventSource) {
      this.removeEventSourceListeners();
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  // Removed - this functionality is now in the connect() method

  /**
   * Build URL with auth token as query parameter
   */
  private async buildAuthenticatedUrl(): Promise<string> {
    const url = new URL(this.config.url);

    if (this.config.authProvider) {
      const headers = await this.getAuthHeaders();
      const authHeader = headers.Authorization || headers.authorization;

      if (authHeader) {
        // Add auth token as query param due to EventSource browser limitation
        url.searchParams.set('auth', encodeURIComponent(authHeader));
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
    // Call base class handler
    this.handleConnectionOpen();
  }

  /**
   * Handle EventSource message event
   */
  private handleEventSourceMessage(event: MessageEvent): void {
    try {
      const message = this.parseMessage(event.data);
      this.handleMessage(message);
    } catch (_error) {
      // Error already logged by parseMessage
    }
  }

  /**
   * Handle EventSource error event
   */
  private handleEventSourceError(): void {
    const readyState = this.eventSource?.readyState ?? -1;
    const error = TransportError.connectionFailed(
      `EventSource connection failed (readyState: ${readyState})`,
    );

    this.handleConnectionError(error);
  }

  // Removed - this functionality is now handled by the base class ReconnectionManager

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

  // Removed - these utilities are now in the base class
}
