/**
 * SDK Transport Helpers
 *
 * Utility functions for managing MCP SDK transport instances,
 * including creation, callback setup, and lifecycle management.
 * @internal
 */

import {
  StreamableHTTPClientTransport as SDKStreamableHTTPClientTransport,
  StreamableHTTPClientTransportOptions,
} from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { TransportError } from '../errors/transport-error.js';
import { logEvent } from '../../logger.js';

/**
 * Configuration for creating an SDK StreamableHTTP transport.
 * @internal
 */
export interface SDKTransportConfig {
  url: string;
  sessionId?: string;
  requestInit?: RequestInit;
  reconnect?: {
    maxAttempts: number;
    initialDelayMs: number;
    maxDelayMs: number;
    backoffMultiplier: number;
  };
}

/**
 * Callbacks for SDK transport events.
 *
 * Uses getter functions to enable dynamic callback resolution at invocation time,
 * allowing callbacks to be updated without recreating the transport.
 * @internal
 */
export interface SDKTransportCallbacks {
  logPrefix: string;
  getIsClosed: () => boolean;
  getOnClose: () => (() => void) | undefined;
  getOnError: () => ((error: Error) => void) | undefined;
  getOnMessage: () => ((message: JSONRPCMessage) => void) | undefined;
}

/**
 * Creates an SDK StreamableHTTP transport with the given configuration.
 *
 * Converts internal config format to SDK options format, including
 * reconnection configuration if specified.
 * @param config - Transport configuration including URL and reconnection options
 * @returns Configured SDK transport instance
 * @internal
 */
export function createSDKTransport(config: SDKTransportConfig): SDKStreamableHTTPClientTransport {
  const url = new URL(config.url);
  const sdkOptions: StreamableHTTPClientTransportOptions = {
    requestInit: config.requestInit,
    sessionId: config.sessionId,
  };

  if (config.reconnect) {
    sdkOptions.reconnectionOptions = {
      maxRetries: config.reconnect.maxAttempts,
      initialReconnectionDelay: config.reconnect.initialDelayMs,
      maxReconnectionDelay: config.reconnect.maxDelayMs,
      reconnectionDelayGrowFactor: config.reconnect.backoffMultiplier,
    };
  }

  return new SDKStreamableHTTPClientTransport(url, sdkOptions);
}

/**
 * Sets up event callbacks for an SDK transport instance.
 *
 * Uses getter functions to dynamically resolve callbacks at invocation time,
 * allowing callback implementations to change without recreating the transport.
 * This is essential for handling reconnection scenarios where callback references
 * may need to be updated.
 * @param sdkTransport - SDK transport instance to configure
 * @param callbacks - Callback getters and configuration
 * @internal
 */
export function setupSDKTransportCallbacks(
  sdkTransport: SDKStreamableHTTPClientTransport,
  callbacks: SDKTransportCallbacks,
): void {
  sdkTransport.onclose = () => {
    logEvent('info', `${callbacks.logPrefix}:sdk-closed`);
    const onclose = callbacks.getOnClose();
    if (onclose && callbacks.getIsClosed()) {
      onclose();
    }
  };

  sdkTransport.onerror = (error: Error) => {
    logEvent('error', `${callbacks.logPrefix}:sdk-error`, {
      error: error.message,
    });
    const onerror = callbacks.getOnError();
    if (onerror) {
      onerror(error);
    }
  };

  sdkTransport.onmessage = (message: JSONRPCMessage) => {
    logEvent('debug', `${callbacks.logPrefix}:sdk-message`, {
      method: 'method' in message ? message.method : 'response',
      id: 'id' in message ? message.id : 'none',
    });
    const onmessage = callbacks.getOnMessage();
    if (onmessage) {
      onmessage(message);
    }
  };
}

/**
 * Replaces an SDK transport instance while preserving state.
 *
 * Closes the old transport gracefully before replacement. Ignores errors
 * during cleanup since the old transport may already be closed.
 * @param oldTransport - Existing transport to close, or null if none
 * @param _newTransport - New transport instance (unused, for future extension)
 * @internal
 */
export async function replaceSDKTransport(
  oldTransport: SDKStreamableHTTPClientTransport | null,
  _newTransport: SDKStreamableHTTPClientTransport,
): Promise<void> {
  // Close old transport gracefully if it exists
  if (oldTransport) {
    try {
      await oldTransport.close();
    } catch {
      // Ignore errors during cleanup - old transport may already be closed
    }
  }
}

/**
 * Validates a URL for StreamableHTTP transport.
 *
 * Ensures the URL is properly formatted and uses http: or https: protocol.
 * @param url - URL string to validate
 * @throws When URL is empty or invalid format
 * @throws When protocol is not http: or https:
 * @internal
 */
export function validateStreamableHTTPUrl(url: string): void {
  if (!url) {
    throw new Error('URL is required for StreamableHTTP transport');
  }

  try {
    const urlObj = new URL(url);
    const validProtocols = ['http:', 'https:'];
    if (!validProtocols.includes(urlObj.protocol)) {
      throw new Error('StreamableHTTP URL must use http: or https: protocol');
    }
  } catch (error) {
    throw TransportError.connectionFailed(`Invalid URL format: ${error}`, error as Error);
  }
}

/**
 * Merges authentication headers into request initialization object.
 *
 * Combines existing headers from requestInit with authentication headers,
 * with auth headers taking precedence in case of conflicts.
 * @param requestInit - Existing request initialization or undefined
 * @param authHeaders - Authentication headers to merge
 * @returns New RequestInit object with merged headers
 * @internal
 */
export function mergeAuthHeaders(
  requestInit: RequestInit | undefined,
  authHeaders: Record<string, string>,
): RequestInit {
  return {
    ...requestInit,
    headers: {
      ...requestInit?.headers,
      ...authHeaders,
    },
  };
}
