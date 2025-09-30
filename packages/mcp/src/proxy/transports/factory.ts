import type {
  ITransportFactory,
  IReconnectableTransport,
  ReconnectableTransportOptions,
} from '../types.js';
import { ReconnectablePrefixedStdioClientTransport } from './reconnectable-transport.js';

/**
 * Default transport factory for creating stdio-based reconnectable transports.
 * SEAM: Can be extended to create different transport types (WebSocket, HTTP, etc.).
 * Currently only creates stdio transports but designed to support future protocols.
 * @public
 * @see file:./reconnectable-transport.ts - Transport implementation
 */
export class DefaultTransportFactory implements ITransportFactory {
  /**
   * Creates a reconnectable stdio transport for the specified server.
   * @param {string} serverName - Server identifier used for logging and prefixing
   * @param {ReconnectableTransportOptions} options - Transport configuration including command, args, and reconnection settings
   * @returns {IReconnectableTransport} Configured reconnectable transport instance
   * @public
   */
  public create(
    serverName: string,
    options: ReconnectableTransportOptions,
  ): IReconnectableTransport {
    return new ReconnectablePrefixedStdioClientTransport(serverName, options);
  }
}

/**
 * Creates a transport factory based on the specified protocol type.
 * SEAM: Currently only 'stdio' is implemented, but extensible for future protocols.
 * Unknown types fall back to stdio for backward compatibility.
 * @param {'stdio' | string} type - Transport protocol type ('stdio' or future: 'websocket', 'http', 'grpc')
 * @returns {ITransportFactory} Factory instance for creating transports of the specified type
 * @example
 * ```typescript
 * const factory = createTransportFactory('stdio');
 * const transport = factory.create('my-server', options);
 * ```
 * @public
 * @see file:../types.ts - ITransportFactory interface
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
