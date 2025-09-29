import type {
  SSETransportConfig,
  StdioTransportConfig,
  StreamableHTTPTransportConfig,
  TransportConfig,
  WebSocketTransportConfig,
} from '@mcp-funnel/models';
import { TransportError, ValidationUtils } from '@mcp-funnel/core';
import { validateReconnectConfig } from './validateReconnectConfig';

/**
 * Validates stdio transport configuration.
 */
function validateStdioConfig(config: StdioTransportConfig): void {
  if (!config.command) {
    throw TransportError.protocolError(
      'Command is required for stdio transport',
    );
  }
}

/**
 * Validates SSE transport configuration.
 */
function validateSSEConfig(config: SSETransportConfig): void {
  if (!config.url) {
    throw TransportError.protocolError('URL is required for SSE transport');
  }

  // Validate URL format
  try {
    ValidationUtils.validateUrl(config.url, 'SSE URL');
  } catch (error) {
    throw TransportError.invalidUrl(
      config.url,
      error instanceof Error ? error : undefined,
    );
  }

  // Validate reconnect configuration
  if (config.reconnect) {
    validateReconnectConfig(config.reconnect);
  }
}

/**
 * Validates WebSocket transport configuration.
 */
function validateWebSocketConfig(config: WebSocketTransportConfig): void {
  if (!config.url) {
    throw TransportError.protocolError(
      'URL is required for WebSocket transport',
    );
  }

  // Validate URL format and protocol
  try {
    ValidationUtils.validateUrl(config.url, 'WebSocket URL');
    const url = new URL(config.url);
    const validProtocols = ['ws:', 'wss:', 'http:', 'https:'];
    if (!validProtocols.includes(url.protocol)) {
      throw TransportError.invalidUrl(
        config.url,
        new Error(
          'WebSocket URL must use ws:, wss:, http:, or https: protocol',
        ),
      );
    }
  } catch (error) {
    throw TransportError.invalidUrl(
      config.url,
      error instanceof Error ? error : undefined,
    );
  }

  // Validate reconnect configuration
  if (config.reconnect) {
    validateReconnectConfig(config.reconnect);
  }

  // Validate timeout
  if (config.timeout !== undefined && config.timeout <= 0) {
    throw TransportError.protocolError('timeout must be a positive number');
  }
}

/**
 * Validates StreamableHTTP transport configuration.
 */
function validateStreamableHTTPConfig(
  config: StreamableHTTPTransportConfig,
): void {
  if (!config.url) {
    throw TransportError.protocolError(
      'URL is required for StreamableHTTP transport',
    );
  }

  // Validate URL format and protocol
  try {
    ValidationUtils.validateUrl(config.url, 'StreamableHTTP URL');
    const url = new URL(config.url);
    const validProtocols = ['http:', 'https:'];
    if (!validProtocols.includes(url.protocol)) {
      throw TransportError.invalidUrl(
        config.url,
        new Error('StreamableHTTP URL must use http: or https: protocol'),
      );
    }
  } catch (error) {
    throw TransportError.invalidUrl(
      config.url,
      error instanceof Error ? error : undefined,
    );
  }

  // Validate reconnect configuration
  if (config.reconnect) {
    validateReconnectConfig(config.reconnect);
  }

  // Validate timeout
  if (config.timeout !== undefined && config.timeout <= 0) {
    throw TransportError.protocolError('timeout must be a positive number');
  }
}

export function validateTransportConfig(config: TransportConfig): void {
  switch (config.type) {
    case 'stdio':
      validateStdioConfig(config);
      break;
    case 'sse':
      validateSSEConfig(config);
      break;
    case 'websocket':
      validateWebSocketConfig(config);
      break;
    case 'streamable-http':
      validateStreamableHTTPConfig(config);
      break;
    default: {
      // Use exhaustive check to handle unknown transport types
      const _exhaustive: never = config;
      throw TransportError.protocolError(
        `Unsupported transport type: ${(_exhaustive as TransportConfig).type}`,
      );
    }
  }
}
