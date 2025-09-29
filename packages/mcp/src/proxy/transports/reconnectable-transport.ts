import { ReconnectionManager } from '@mcp-funnel/core';
import {
  ConnectionState,
  type ConnectionStateChange,
} from '@mcp-funnel/models';
import { logger, prefixedLog } from '../logging.js';
import type {
  ReconnectableTransportOptions,
  IReconnectableTransport,
} from '../types.js';
import { HealthCheckManager } from '../util/health-check.js';
import { scheduleReconnection } from '../util/reconnection-scheduler.js';
import {
  createNormalizedReconnectionOptions,
  type NormalizedReconnectionOptions,
} from '../util/reconnection-config.js';
import { PrefixedStdioClientTransport } from './base-transport.js';

/**
 * Enhanced transport with reconnection capability and health checks
 */
export class ReconnectablePrefixedStdioClientTransport
  extends PrefixedStdioClientTransport
  implements IReconnectableTransport
{
  private reconnectionManager: ReconnectionManager;
  private healthCheckManager: HealthCheckManager;
  private reconnectionOptions: NormalizedReconnectionOptions;
  private isManuallyDisconnected = false;
  private disconnectionHandlers: ((state: ConnectionStateChange) => void)[] =
    [];

  public constructor(
    serverName: string,
    private enhancedOptions: ReconnectableTransportOptions,
  ) {
    super(serverName, enhancedOptions);

    // Normalize options with defaults
    this.reconnectionOptions =
      createNormalizedReconnectionOptions(enhancedOptions);

    this.reconnectionManager = new ReconnectionManager(
      this.reconnectionOptions.reconnection,
    );

    // Set up health check manager
    this.healthCheckManager = new HealthCheckManager({
      serverName: this._serverName,
      enabled: this.reconnectionOptions.healthChecks,
      intervalMs: this.reconnectionOptions.healthCheckInterval,
      onHealthCheckFailed: (error) => this.handleDisconnection(error),
    });

    // Set up reconnection state change handling
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

  public get connectionState(): ConnectionState {
    return this.reconnectionManager.state;
  }

  public get retryCount(): number {
    return this.reconnectionManager.currentRetryCount;
  }

  public async start(): Promise<void> {
    this.isManuallyDisconnected = false;
    this.reconnectionManager.onConnecting();

    try {
      await super.start();
      this.reconnectionManager.onConnected();
      this.healthCheckManager.start(() => this.process);

      // Override the parent's close handler to add reconnection logic
      super.onclose = () => {
        this.healthCheckManager.stop();

        if (!this.isManuallyDisconnected) {
          const error = new Error('Server process closed unexpectedly');
          this.handleDisconnection(error);
        }
      };

      // Override the parent's error handler to add reconnection logic
      super.onerror = (error: Error) => {
        this.handleDisconnection(error);
      };
    } catch (error) {
      this.reconnectionManager.onDisconnected(error as Error);
      throw error;
    }
  }

  private handleDisconnection(error: Error): void {
    this.healthCheckManager.stop();
    this.reconnectionManager.onDisconnected(error);

    if (
      !this.isManuallyDisconnected &&
      this.reconnectionManager.hasRetriesLeft
    ) {
      this.scheduleReconnection();
    }
  }

  private scheduleReconnection(): void {
    scheduleReconnection(
      {
        serverName: this._serverName,
        maxAttempts: this.reconnectionOptions.reconnection.maxAttempts,
        reconnectionManager: this.reconnectionManager,
      },
      async () => {
        // Clean up old process
        await this.close();

        // Attempt to restart
        await this.start();
      },
    ).catch((error) => {
      // Handle non-fatal errors (individual retry attempts)
      if (!error.message.includes('Max reconnection attempts')) {
        this.handleDisconnection(error);
      }
    });
  }

  public async close(): Promise<void> {
    this.isManuallyDisconnected = true;
    this.healthCheckManager.stop();
    this.reconnectionManager.cancelReconnect();
    this.reconnectionManager.reset();
    await super.close();
  }

  public async reconnect(): Promise<void> {
    console.error(
      prefixedLog(this._serverName, 'Manual reconnection requested'),
    );
    this.reconnectionManager.reset();
    await this.close();
    await this.start();
  }

  public onDisconnection(
    handler: (state: ConnectionStateChange) => void,
  ): void {
    this.disconnectionHandlers.push(handler);
  }

  public removeDisconnectionHandler(
    handler: (state: ConnectionStateChange) => void,
  ): void {
    const index = this.disconnectionHandlers.indexOf(handler);
    if (index >= 0) {
      this.disconnectionHandlers.splice(index, 1);
    }
  }

  public async destroy(): Promise<void> {
    await this.close();
    this.reconnectionManager.destroy();
    this.disconnectionHandlers.length = 0;
  }
}
