import type {
  ReconnectableTransportOptions,
  IReconnectableTransport,
  ITransportFactory,
} from './types.js';
import { ReconnectablePrefixedStdioClientTransport } from '../transports/implementations/reconnectable-prefixed-stdio-client-transport.js';

// Re-export for backward compatibility
export { PrefixedStdioClientTransport } from '../transports/implementations/prefixed-stdio-client-transport.js';

// Factory implementations - SEAM: Can be extended for WebSocket, HTTP, or custom protocols
export class DefaultTransportFactory implements ITransportFactory {
  create(
    serverName: string,
    options: ReconnectableTransportOptions,
  ): IReconnectableTransport {
    return new ReconnectablePrefixedStdioClientTransport(serverName, options);
  }
}

export function createTransportFactory(
  _type: 'stdio' | string = 'stdio',
): ITransportFactory {
  return new DefaultTransportFactory(); // SEAM: Future transport types can be added here
}
