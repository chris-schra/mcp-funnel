/**
 * Transport wrapper that adds factory-specific methods to transport implementations.
 * Provides a consistent interface for all transport types with additional metadata.
 */

import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { TransportConfig } from '../../types/transport.types.js';
import type { IAuthProvider } from '../../auth/interfaces/auth-provider.interface.js';
import type { ITokenStorage } from '../../auth/interfaces/token-storage.interface.js';

/**
 * Extended transport interface that includes factory-specific properties
 */
export interface FactoryTransport extends Transport {
  type: string;
  config: TransportConfig;
  authProvider?: IAuthProvider;
  tokenStorage?: ITokenStorage;
  dispose: () => Promise<void>;
  isConnected: () => boolean;
}

/**
 * Wrapper class to add factory-specific methods to transport implementations
 */
export class TransportWrapper implements FactoryTransport {
  public readonly type: string;
  public readonly config: TransportConfig;
  public readonly authProvider?: IAuthProvider;
  public readonly tokenStorage?: ITokenStorage;

  constructor(
    private transport: Transport,
    type: string,
    config: TransportConfig,
    authProvider?: IAuthProvider,
    tokenStorage?: ITokenStorage,
  ) {
    this.type = type;
    this.config = config;
    this.authProvider = authProvider;
    this.tokenStorage = tokenStorage;
  }

  // Delegate Transport interface methods
  get onclose() {
    return this.transport.onclose;
  }
  set onclose(value) {
    this.transport.onclose = value;
  }

  get onerror() {
    return this.transport.onerror;
  }
  set onerror(value) {
    this.transport.onerror = value;
  }

  get onmessage() {
    return this.transport.onmessage;
  }
  set onmessage(value) {
    this.transport.onmessage = value;
  }

  get sessionId() {
    return this.transport.sessionId;
  }
  set sessionId(value) {
    this.transport.sessionId = value;
  }

  async start() {
    return this.transport.start();
  }
  async send(message: JSONRPCMessage, options?: TransportSendOptions) {
    return this.transport.send(message, options);
  }
  async close() {
    return this.transport.close();
  }
  setProtocolVersion?(version: string) {
    if (this.transport.setProtocolVersion) {
      this.transport.setProtocolVersion(version);
    }
  }

  // Factory-specific methods
  async dispose(): Promise<void> {
    await this.close();
  }

  isConnected(): boolean {
    // Basic implementation - can be enhanced based on transport state
    // Type assertion for internal transport state properties
    const transportWithState = this.transport as {
      isStarted?: boolean;
      isClosed?: boolean;
    };
    return !!(transportWithState.isStarted && !transportWithState.isClosed);
  }
}
