import { EventEmitter } from 'events';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { type Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { TargetServer, TargetServerZod } from '../../config.js';
import { ServerStatus } from '../../types/index.js';

export interface ServerConnection {
  server: TargetServer | TargetServerZod;
  client: Client;
  transport: Transport;
  connectedAt: string;
}

export interface DisconnectedServer {
  server: TargetServer | TargetServerZod;
  error?: string;
}

export interface ConnectionStatus {
  connected: Map<string, ServerConnection>;
  disconnected: Map<string, DisconnectedServer>;
}

export interface ReconnectionEvent {
  serverName: string;
  status: 'reconnecting' | 'connected' | 'disconnected';
  timestamp: string;
  retryAttempt?: number;
  reason?: string;
}

export interface IConnectionManager extends EventEmitter {
  /**
   * Initialize all configured servers
   */
  initialize(): Promise<void>;

  /**
   * Connect to a single server
   */
  connectToServer(server: TargetServer | TargetServerZod): Promise<void>;

  /**
   * Disconnect from a server
   */
  disconnectServer(name: string): Promise<void>;

  /**
   * Reconnect to a disconnected server
   */
  reconnectServer(name: string): Promise<void>;

  /**
   * Get connection status for all servers
   */
  getConnectionStatus(): ConnectionStatus;

  /**
   * Get status for a specific server
   */
  getServerStatus(name: string): ServerStatus;

  /**
   * Check if a server is connected
   */
  isServerConnected(name: string): boolean;

  /**
   * Get all connected clients
   */
  getConnectedClients(): Map<string, Client>;

  /**
   * Clean up resources
   */
  destroy(): Promise<void>;
}
