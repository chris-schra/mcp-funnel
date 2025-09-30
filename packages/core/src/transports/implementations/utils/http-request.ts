/**
 * HTTP Request Utilities for Transport Implementations
 *
 * Provides HTTP request functionality with auth headers, 401 handling, and retry logic.
 */

import type {
  JSONRPCMessage,
  JSONRPCRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { TransportError } from '../../errors/transport-error.js';
import type { IAuthProvider } from '../../../auth/index.js';
import { logEvent } from '../../../logger.js';

/**
 * Execute HTTP request with auth headers, 401 handling, and retry logic
 */
export async function executeHttpRequest(
  url: string,
  message: JSONRPCMessage,
  signal: AbortSignal,
  timeout: number,
  logPrefix: string,
  authProvider?: IAuthProvider,
): Promise<void> {
  const isRequest = 'method' in message;

  try {
    // Get auth headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (authProvider) {
      const authHeaders = await authProvider.getHeaders();
      Object.assign(headers, authHeaders);
    }

    // Send HTTP POST request
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(message),
      signal,
    });

    // Handle HTTP errors
    if (!response.ok) {
      // Special handling for 401 Unauthorized
      if (response.status === 401 && authProvider?.refresh && isRequest) {
        try {
          await authProvider.refresh();
          // Retry with refreshed token
          const retryHeaders = {
            'Content-Type': 'application/json',
            ...(await authProvider.getHeaders()),
          };

          const retryResponse = await fetch(url, {
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
          logEvent('error', `${logPrefix}:token-refresh-failed`, {
            error: String(refreshError),
          });
          throw TransportError.fromHttpStatus(401, 'Token refresh failed');
        }
      }

      throw TransportError.fromHttpStatus(response.status, response.statusText);
    }

    logEvent('debug', `${logPrefix}:http-request-sent`, {
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
        throw TransportError.requestTimeout(timeout, error);
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
