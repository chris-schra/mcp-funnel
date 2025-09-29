import type {
  ITransportFactory,
  IReconnectableTransport,
  ReconnectableTransportOptions,
} from '../types.js';
import { ReconnectablePrefixedStdioClientTransport } from './reconnectable-transport.js';

/**
 * Default transport factory implementation
 * SEAM: Can be extended to create different transport types
 */
export class DefaultTransportFactory implements ITransportFactory {
  public create(
    serverName: string,
    options: ReconnectableTransportOptions,
  ): IReconnectableTransport {
    return new ReconnectablePrefixedStdioClientTransport(serverName, options);
  }
}

/**
 * Factory function to create transport factories
 * SEAM: Can be extended to return different factory implementations
 * for WebSocket, HTTP, or custom protocol transports
 */
export function createTransportFactory(
  type: 'stdio' | string = 'stdio',
): ITransportFactory {
  switch (type) {
    case 'stdio':
      return new DefaultTransportFactory();
    default:
      // SEAM: Future transport factory implementations can be added here
      // e.g., 'websocket', 'http', 'grpc', etc.
      return new DefaultTransportFactory();
  }
}
