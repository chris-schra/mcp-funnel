import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  ReconnectionManager,
  ConnectionState,
  type ConnectionStateChange,
} from '../../reconnection-manager.js';
import { logger, prefixedLog } from '../../proxy/logging.js';
import { PrefixedStdioClientTransport } from './prefixed-stdio-client-transport.js';
import type {
  ReconnectableTransportOptions,
  IReconnectableTransport,
} from '../../proxy/types.js';
import {
  createReconnectionConfig,
  logReconnectionAttempt,
  logReconnectionSuccess,
  logReconnectionFailure,
  logMaxRetriesReached,
  type EventHandler,
  type HandlerArray,
} from '../../proxy/transport-utils.js';

/**
 * Enhanced transport with reconnection capability and health checks
 */
export class ReconnectablePrefixedStdioClientTransport
  extends PrefixedStdioClientTransport
  implements IReconnectableTransport
{
  private reconnectionManager: ReconnectionManager;
  private healthCheckInterval?: NodeJS.Timeout;
  private reconnectionOptions: Required<
    Pick<
      ReconnectableTransportOptions,
      'healthChecks' | 'healthCheckInterval' | 'reconnection'
    >
  >;
  private isManuallyDisconnected = false;
  private disconnectionHandlers: HandlerArray<ConnectionStateChange> = [];

  constructor(
    serverName: string,
    private enhancedOptions: ReconnectableTransportOptions,
  ) {
    super(serverName, enhancedOptions);
    this.reconnectionManager = new ReconnectionManager(
      enhancedOptions.reconnection,
    );
    this.reconnectionOptions = {
      healthChecks: enhancedOptions.healthChecks ?? true,
      healthCheckInterval: enhancedOptions.healthCheckInterval ?? 30000,
      reconnection: createReconnectionConfig(enhancedOptions.reconnection),
    };
    this.reconnectionManager.onStateChange((stateChange) => {
      logger.info('transport:state_change', {
        server: this._serverName,
        from: stateChange.from,
        to: stateChange.to,
        retryCount: stateChange.retryCount,
        nextRetryDelay: stateChange.nextRetryDelay,
        error: stateChange.error?.message,
      });
      this.disconnectionHandlers.forEach((handler) => handler(stateChange));
    });
  }

  get connectionState(): ConnectionState {
    return this.reconnectionManager.state;
  }
  get retryCount(): number {
    return this.reconnectionManager.currentRetryCount;
  }

  async start(): Promise<void> {
    this.isManuallyDisconnected = false;
    this.reconnectionManager.onConnecting();
    try {
      await super.start();
      this.reconnectionManager.onConnected();
      this.startHealthChecks();
      super.onclose = () => {
        this.stopHealthChecks();
        if (!this.isManuallyDisconnected) {
          this.handleDisconnection(
            new Error('Server process closed unexpectedly'),
          );
        }
      };
      super.onerror = (error: Error) => this.handleDisconnection(error);
    } catch (error) {
      this.reconnectionManager.onDisconnected(error as Error);
      throw error;
    }
  }

  private startHealthChecks(): void {
    if (!this.reconnectionOptions.healthChecks) return;
    this.healthCheckInterval = setInterval(() => {
      (!this.process || this.process.killed
        ? Promise.reject(new Error('Process is not running'))
        : Promise.resolve()
      ).catch((error) => {
        console.error(
          prefixedLog(this._serverName, `Health check failed: ${error}`),
        );
        this.handleDisconnection(error);
      });
    }, this.reconnectionOptions.healthCheckInterval);
  }

  private stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  private handleDisconnection(error: Error): void {
    this.stopHealthChecks();
    this.reconnectionManager.onDisconnected(error);
    if (!this.isManuallyDisconnected && this.reconnectionManager.hasRetriesLeft)
      this.scheduleReconnection();
  }

  private scheduleReconnection(): void {
    const maxRetries = this.reconnectionOptions.reconnection.maxRetries;
    this.reconnectionManager
      .scheduleReconnect(async () => {
        logReconnectionAttempt(
          this._serverName,
          this.reconnectionManager.currentRetryCount ?? 0,
          maxRetries ?? 10,
        );
        await this.close();
        await this.start();
        logReconnectionSuccess(this._serverName);
      })
      .catch((error) => {
        logReconnectionFailure(this._serverName, error);
        if (error.message.includes('Max reconnection attempts')) {
          logMaxRetriesReached(this._serverName);
          logger.error('reconnection-failed-max-retries', error, {
            server: this._serverName,
          });
        } else {
          this.handleDisconnection(error);
        }
      });
  }

  async close(): Promise<void> {
    this.isManuallyDisconnected = true;
    this.stopHealthChecks();
    this.reconnectionManager.cancelReconnect();
    this.reconnectionManager.reset();
    await super.close();
  }

  async reconnect(): Promise<void> {
    console.error(
      prefixedLog(this._serverName, 'Manual reconnection requested'),
    );
    this.reconnectionManager.reset();
    await this.close();
    await this.start();
  }

  onDisconnection(handler: EventHandler<ConnectionStateChange>): void {
    this.disconnectionHandlers.push(handler);
  }
  removeDisconnectionHandler(
    handler: EventHandler<ConnectionStateChange>,
  ): void {
    const index = this.disconnectionHandlers.indexOf(handler);
    if (index >= 0) this.disconnectionHandlers.splice(index, 1);
  }

  async destroy(): Promise<void> {
    await this.close();
    this.reconnectionManager.destroy();
    this.disconnectionHandlers.length = 0;
  }
}
