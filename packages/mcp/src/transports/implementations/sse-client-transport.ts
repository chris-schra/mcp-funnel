/**
 * SSE Client Transport Implementation for MCP OAuth
 *
 * Server-Sent Events (SSE) transport for client connections with OAuth authentication.
 * Implements the MCP SDK Transport interface with:
 * - EventSource for server→client messages (SSE stream)
 * - HTTP POST for client→server messages with auth headers
 * - UUID correlation between requests and responses
 * - Secure auth token transmission via headers (eventsource package supports headers)
 * - Automatic reconnection with exponential backoff
 * - 401 response handling with token refresh retry
 * - Proper resource cleanup and timeout support
 * - Security: token sanitization in error messages and no token exposure in URLs
 */

import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  EventSource,
  EventSourceFetchInit,
  FetchLikeResponse,
} from 'eventsource';
import { TransportError } from '../errors/transport-error.js';
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
   * Create EventSource connection with secure header-based authentication
   */
  protected async connect(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    try {
      // Build clean URL and separate auth headers for security
      const { url, headers } = await this.buildAuthenticatedConnection();

      // Create EventSource with custom fetch that includes auth headers
      // The eventsource package supports custom fetch functions
      const customFetch = this.createAuthenticatedFetch(headers);

      this.eventSource = new EventSource(url, {
        fetch: customFetch,
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
    await this.executeHttpRequest(
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
   * Build clean URL and auth headers for secure EventSource connection
   *
   * SECURITY: Auth tokens are passed via headers, NEVER in URLs to prevent:
   * - Server log exposure
   * - Browser history leakage
   * - Network monitoring interception
   * - Referrer header exposure
   */
  private async buildAuthenticatedConnection(): Promise<{
    url: string;
    headers: Record<string, string>;
  }> {
    // Build clean URL without any auth parameters
    const url = new URL(this.config.url);

    // Prepare headers object
    const headers: Record<string, string> = {};

    // Add auth headers if auth provider is configured
    if (this.config.authProvider) {
      const authHeaders = await this.getAuthHeaders();
      Object.assign(headers, authHeaders);
    }

    return {
      url: url.toString(),
      headers,
    };
  }

  /**
   * Create a custom fetch function that includes auth headers
   *
   * This ensures that authentication tokens are sent securely via headers
   * rather than being exposed in URLs.
   */
  private createAuthenticatedFetch(authHeaders: Record<string, string>) {
    return async (
      url: string | URL,
      init: EventSourceFetchInit,
    ): Promise<FetchLikeResponse> => {
      // Merge auth headers with any existing headers
      const mergedHeaders = {
        ...init.headers,
        ...authHeaders,
      };

      // Call fetch with merged headers
      return fetch(url, {
        ...init,
        headers: mergedHeaders,
      });
    };
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

  // Removed - these utilities are now in the base class
}
