import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { FactoryTransport } from '../../types/index.js';
import type { TransportConfig } from '@mcp-funnel/models';
import type { IAuthProvider, ITokenStorage } from '@mcp-funnel/core';
import type {
  Transport,
  TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * Wrapper class to add factory-specific methods to transport implementations
 */
export class TransportWrapper implements FactoryTransport {
  public readonly type: string;
  public readonly config: TransportConfig;
  public readonly authProvider?: IAuthProvider;
  public readonly tokenStorage?: ITokenStorage;

  public constructor(
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
  public get onclose() {
    return this.transport.onclose;
  }
  public set onclose(value) {
    this.transport.onclose = value;
  }

  public get onerror() {
    return this.transport.onerror;
  }
  public set onerror(value) {
    this.transport.onerror = value;
  }

  public get onmessage() {
    return this.transport.onmessage;
  }
  public set onmessage(value) {
    this.transport.onmessage = value;
  }

  public get sessionId() {
    return this.transport.sessionId;
  }
  public set sessionId(value) {
    this.transport.sessionId = value;
  }

  public async start() {
    return this.transport.start();
  }
  public async send(message: JSONRPCMessage, options?: TransportSendOptions) {
    return this.transport.send(message, options);
  }
  public async close() {
    return this.transport.close();
  }
  public setProtocolVersion?(version: string) {
    if (this.transport.setProtocolVersion) {
      this.transport.setProtocolVersion(version);
    }
  }

  // Factory-specific methods
  public async dispose(): Promise<void> {
    await this.close();
  }

  public isConnected(): boolean {
    // Basic implementation - can be enhanced based on transport state
    // Type assertion for internal transport state properties
    const transportWithState = this.transport as {
      isStarted?: boolean;
      isClosed?: boolean;
    };
    return !!(transportWithState.isStarted && !transportWithState.isClosed);
  }
}
