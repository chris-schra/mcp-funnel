import type { IAuthProvider, ITokenStorage } from '@mcp-funnel/core';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { TransportConfig } from '@mcp-funnel/models';

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
