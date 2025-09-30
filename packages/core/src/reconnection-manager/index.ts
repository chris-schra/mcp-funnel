import {
  ConnectionState,
  type ConnectionStateChange,
  type ReconnectionConfig,
} from '@mcp-funnel/models';

export class ReconnectionManager {
  private retryCount = 0;
  private currentState = ConnectionState.Disconnected;
  private retryTimeout?: NodeJS.Timeout;
  private config: {
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    maxRetries: number;
    jitter: number;
  };
  private stateChangeHandlers: ((event: ConnectionStateChange) => void)[] = [];

  public constructor(config: ReconnectionConfig = {}) {
    this.config = {
      initialDelay: config.initialDelayMs ?? config.initialDelay ?? 1000,
      maxDelay: config.maxDelayMs ?? config.maxDelay ?? 30000,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      maxRetries: config.maxAttempts ?? config.maxRetries ?? 10,
      jitter: config.jitter ?? 0.25,
    };
  }

  public get state(): ConnectionState {
    return this.currentState;
  }

  public get currentRetryCount(): number {
    return this.retryCount;
  }

  public get hasRetriesLeft(): boolean {
    return this.retryCount < this.config.maxRetries;
  }

  private setState(newState: ConnectionState, error?: Error): void {
    const from = this.currentState;
    this.currentState = newState;

    const event: ConnectionStateChange = {
      from,
      to: newState,
      retryCount: this.retryCount,
      error,
    };

    if (newState === ConnectionState.Reconnecting && this.hasRetriesLeft) {
      event.nextRetryDelay = this.calculateNextDelay();
    }

    this.stateChangeHandlers.forEach((handler) => handler(event));
  }

  private calculateNextDelay(): number {
    const baseDelay = Math.min(
      this.config.initialDelay *
        Math.pow(this.config.backoffMultiplier, this.retryCount),
      this.config.maxDelay,
    );

    // Add jitter: ±25% by default
    const jitterAmount = baseDelay * this.config.jitter;
    const jitter = (Math.random() - 0.5) * 2 * jitterAmount;

    return Math.max(0, Math.round(baseDelay + jitter));
  }

  /**
   * Called when a connection attempt is starting
   */
  public onConnecting(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }

    const newState =
      this.retryCount === 0
        ? ConnectionState.Connecting
        : ConnectionState.Reconnecting;

    this.setState(newState);
  }

  /**
   * Called when connection is successful
   */
  public onConnected(): void {
    this.retryCount = 0;
    this.setState(ConnectionState.Connected);
  }

  /**
   * Called when connection fails or is lost
   */
  public onDisconnected(error?: Error): void {
    if (this.currentState === ConnectionState.Failed) {
      return; // Already failed, don't change state
    }

    this.setState(ConnectionState.Disconnected, error);
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   * @param connectFn Function to call for reconnection
   * @returns Promise that resolves when reconnection is scheduled, or rejects if max retries exceeded
   */
  public scheduleReconnect(connectFn: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.hasRetriesLeft) {
        this.setState(ConnectionState.Failed);
        reject(
          new Error(
            `Max reconnection attempts (${this.config.maxRetries}) exceeded`,
          ),
        );
        return;
      }

      // Calculate delay BEFORE incrementing retry count so first attempt uses backoff^0
      const delay = this.calculateNextDelay();
      this.retryCount++;

      this.setState(ConnectionState.Reconnecting);

      this.retryTimeout = setTimeout(async () => {
        try {
          await connectFn();
          resolve();
        } catch (error) {
          // Let the caller handle the error and call onDisconnected again
          reject(error);
        }
      }, delay);
    });
  }

  /**
   * Cancel any pending reconnection attempts
   */
  public cancelReconnect(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }
  }

  /**
   * Reset the retry count (useful when manually reconnecting)
   */
  public reset(): void {
    this.retryCount = 0;
    this.cancelReconnect();
    this.setState(ConnectionState.Disconnected);
  }

  /**
   * Get current attempt count
   */
  public getAttemptCount(): number {
    return this.retryCount;
  }

  /**
   * Schedule reconnection (simple wrapper for scheduleReconnect)
   */
  public scheduleReconnection(reconnectFn: () => void | Promise<void>): void {
    this.scheduleReconnect(async () => {
      await reconnectFn();
    }).catch(() => {
      // Error already handled via state change to Failed
    });
  }

  /**
   * Cancel (alias for cancelReconnect for compatibility)
   */
  public cancel(): void {
    this.cancelReconnect();
  }

  /**
   * Add a state change handler
   */
  public onStateChange(handler: (event: ConnectionStateChange) => void): void {
    this.stateChangeHandlers.push(handler);
  }

  /**
   * Remove a state change handler
   */
  public removeStateChangeHandler(
    handler: (event: ConnectionStateChange) => void,
  ): void {
    const index = this.stateChangeHandlers.indexOf(handler);
    if (index >= 0) {
      this.stateChangeHandlers.splice(index, 1);
    }
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.cancelReconnect();
    this.stateChangeHandlers.length = 0;
  }
}
