import { spawn, type ChildProcess } from 'child_process';
import * as readline from 'readline';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  ReconnectionManager,
  ConnectionState,
  type ConnectionStateChange,
} from '../reconnection-manager.js';
import { logger, logServerStream, prefixedLog } from './logging.js';
import type {
  TransportOptions,
  ReconnectableTransportOptions,
  IReconnectableTransport,
  StreamHandlerConfig,
  ITransportFactory,
} from './types.js';

/**
 * Base transport that prefixes server stderr logs and handles stdio communication
 */
export class PrefixedStdioClientTransport {
  protected readonly _serverName: string;
  protected process?: ChildProcess;
  private messageHandlers: ((message: JSONRPCMessage) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  private closeHandlers: (() => void)[] = [];

  constructor(
    serverName: string,
    private options: TransportOptions,
  ) {
    this._serverName = serverName;
  }

  async start(): Promise<void> {
    try {
      // Spawn the process with full control over stdio
      this.process = spawn(this.options.command, this.options.args || [], {
        env: this.options.env,
        stdio: ['pipe', 'pipe', 'pipe'], // Full control over all streams
        cwd: process.cwd(), // Explicitly set cwd
      });

      logger.debug('transport:start', {
        server: this._serverName,
        command: this.options.command,
        args: this.options.args,
      });
    } catch (error) {
      const errorMsg = prefixedLog(
        this._serverName,
        `Failed to spawn process: ${error}`,
      );
      logger.error(errorMsg, error, {
        server: this._serverName,
        context: 'spawn-failed',
        command: this.options.command,
        args: this.options.args,
      });
      throw error;
    }

    // Set up stream handlers
    this.setupStreamHandlers();

    // Handle process errors and exit
    this.setupProcessHandlers();
  }

  private setupStreamHandlers(): void {
    if (!this.process) return;

    // Handle stderr with prefixing
    if (this.process.stderr) {
      this.createStreamHandler({
        serverName: this._serverName,
        stream: this.process.stderr,
        streamType: 'stderr',
        onLine: (line) => {
          console.error(prefixedLog(this._serverName, line));
          logServerStream(this._serverName, 'stderr', line);
        },
      });
    }

    // Handle stdout for MCP protocol messages
    if (this.process.stdout) {
      this.createStreamHandler({
        serverName: this._serverName,
        stream: this.process.stdout,
        streamType: 'stdout',
        onLine: (line) => {
          try {
            const message = JSON.parse(line) as JSONRPCMessage;
            this.messageHandlers.forEach((handler) => handler(message));
          } catch {
            // Not a JSON message, might be a log line that went to stdout
            console.error(prefixedLog(this._serverName, line));
            logServerStream(this._serverName, 'stdout', line);
            logger.debug('transport:nonjson_stdout', {
              server: this._serverName,
              line: line.slice(0, 200),
            });
          }
        },
      });
    }
  }

  private createStreamHandler(config: StreamHandlerConfig): void {
    const rl = readline.createInterface({
      input: config.stream,
      crlfDelay: Infinity,
    });

    rl.on('line', (line: string) => {
      if (line.trim()) {
        config.onLine(line);
      }
    });
  }

  private setupProcessHandlers(): void {
    if (!this.process) return;

    this.process.on('error', (error) => {
      const errorMsg = prefixedLog(this._serverName, `Process error: ${error}`);
      logger.error(errorMsg, error, {
        server: this._serverName,
        context: 'process-error',
      });
      this.errorHandlers.forEach((handler) => handler(error));
    });

    this.process.on('close', (code, signal) => {
      if (code !== 0) {
        const errorMsg = `Process exited with code ${code}, signal ${signal}`;
        const prefixedMsg = prefixedLog(this._serverName, errorMsg);
        logger.error(
          prefixedMsg,
          { message: errorMsg, code, signal },
          {
            server: this._serverName,
            context: 'process-exit',
            code,
            signal,
          },
        );
      }
      this.closeHandlers.forEach((handler) => handler());
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error('Transport not started');
    }
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  async close(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }

  set onmessage(handler: (message: JSONRPCMessage) => void) {
    this.messageHandlers.push(handler);
  }

  set onerror(handler: (error: Error) => void) {
    this.errorHandlers.push(handler);
  }

  set onclose(handler: () => void) {
    this.closeHandlers.push(handler);
  }
}

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
  private disconnectionHandlers: ((state: ConnectionStateChange) => void)[] =
    [];

  constructor(
    serverName: string,
    private enhancedOptions: ReconnectableTransportOptions,
  ) {
    super(serverName, enhancedOptions);
    this.reconnectionManager = new ReconnectionManager(
      enhancedOptions.reconnection,
    );
    // Ensure reconnection config has all defaults filled in
    const reconnectionConfig = {
      initialDelay: enhancedOptions.reconnection?.initialDelay ?? 1000,
      maxDelay: enhancedOptions.reconnection?.maxDelay ?? 30000,
      backoffMultiplier: enhancedOptions.reconnection?.backoffMultiplier ?? 2,
      maxRetries: enhancedOptions.reconnection?.maxRetries ?? 10,
      jitter: enhancedOptions.reconnection?.jitter ?? 0.25,
    };

    this.reconnectionOptions = {
      healthChecks: enhancedOptions.healthChecks ?? true,
      healthCheckInterval: enhancedOptions.healthCheckInterval ?? 30000,
      reconnection: reconnectionConfig,
    };

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

      // Override the parent's close handler to add reconnection logic
      super.onclose = () => {
        this.stopHealthChecks();

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

  private startHealthChecks(): void {
    if (!this.reconnectionOptions.healthChecks) {
      return;
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck().catch((error) => {
        const errorMsg = prefixedLog(
          this._serverName,
          `Health check failed: ${error}`,
        );
        console.error(errorMsg);
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

  private async performHealthCheck(): Promise<void> {
    // Simple health check - ensure the process is still alive
    if (!this.process || this.process.killed) {
      throw new Error('Process is not running');
    }

    // SEAM: Additional health checks can be implemented here:
    // - Sending a ping message if the server supports it
    // - Checking if stdin/stdout/stderr streams are still writable/readable
    // - Custom protocol-specific health checks
  }

  private handleDisconnection(error: Error): void {
    this.stopHealthChecks();
    this.reconnectionManager.onDisconnected(error);

    if (
      !this.isManuallyDisconnected &&
      this.reconnectionManager.hasRetriesLeft
    ) {
      this.scheduleReconnection();
    }
  }

  private scheduleReconnection(): void {
    // Use stored config to avoid accessing private property
    const maxRetries = this.reconnectionOptions.reconnection.maxRetries;
    this.reconnectionManager
      .scheduleReconnect(async () => {
        const attemptMsg = prefixedLog(
          this._serverName,
          `Attempting reconnection (${this.reconnectionManager.currentRetryCount}/${maxRetries})`,
        );
        console.error(attemptMsg);

        // Clean up old process
        await this.close();

        // Attempt to restart
        await this.start();

        console.error(prefixedLog(this._serverName, 'Reconnection successful'));
      })
      .catch((error) => {
        const failMsg = prefixedLog(
          this._serverName,
          `Reconnection failed: ${error}`,
        );
        console.error(failMsg);

        if (error.message.includes('Max reconnection attempts')) {
          const giveUpMsg = prefixedLog(
            this._serverName,
            'Giving up after maximum retry attempts',
          );
          console.error(giveUpMsg);
          logger.error('reconnection-failed-max-retries', error, {
            server: this._serverName,
          });
        } else {
          // Individual attempt failed, will try again
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

  onDisconnection(handler: (state: ConnectionStateChange) => void): void {
    this.disconnectionHandlers.push(handler);
  }

  removeDisconnectionHandler(
    handler: (state: ConnectionStateChange) => void,
  ): void {
    const index = this.disconnectionHandlers.indexOf(handler);
    if (index >= 0) {
      this.disconnectionHandlers.splice(index, 1);
    }
  }

  async destroy(): Promise<void> {
    await this.close();
    this.reconnectionManager.destroy();
    this.disconnectionHandlers.length = 0;
  }
}

/**
 * Default transport factory implementation
 * SEAM: Can be extended to create different transport types
 */
export class DefaultTransportFactory implements ITransportFactory {
  create(
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
