import {
  ConnectionState,
  type ConnectionStateChange,
  type ReconnectionConfig,
} from '@mcp-funnel/models';

/**
 * Manages automatic reconnection attempts with exponential backoff.
 *
 * Tracks connection state transitions and schedules reconnection attempts
 * with configurable exponential backoff, jitter, and retry limits. Used by
 * transports to handle connection failures gracefully.
 * @example
 * ```typescript
 * const manager = new ReconnectionManager({
 *   initialDelayMs: 1000,
 *   maxDelayMs: 30000,
 *   maxAttempts: 10
 * });
 *
 * manager.onStateChange((event) => {
 *   console.log(`Connection: ${event.from} -> ${event.to}`);
 * });
 *
 * manager.onConnecting();
 * await connectToServer();
 * manager.onConnected();
 * ```
 * @public
 */
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
      this.config.initialDelay * Math.pow(this.config.backoffMultiplier, this.retryCount),
      this.config.maxDelay,
    );

    // Add jitter: ±25% by default
    const jitterAmount = baseDelay * this.config.jitter;
    const jitter = (Math.random() - 0.5) * 2 * jitterAmount;

    return Math.max(0, Math.round(baseDelay + jitter));
  }

  /**
   * Signals that a connection attempt is starting.
   *
   * Updates state to Connecting (first attempt) or Reconnecting (retry).
   * Cancels any pending retry timeout.
   * @public
   */
  public onConnecting(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }

    const newState =
      this.retryCount === 0 ? ConnectionState.Connecting : ConnectionState.Reconnecting;

    this.setState(newState);
  }

  /**
   * Signals that connection was successful.
   *
   * Resets retry count and updates state to Connected.
   * @public
   */
  public onConnected(): void {
    this.retryCount = 0;
    this.setState(ConnectionState.Connected);
  }

  /**
   * Signals that connection failed or was lost.
   *
   * Updates state to Disconnected unless already in Failed state.
   * Does not automatically schedule a retry - use scheduleReconnect for that.
   * @param error - Optional error describing the disconnection
   * @public
   */
  public onDisconnected(error?: Error): void {
    if (this.currentState === ConnectionState.Failed) {
      return; // Already failed, don't change state
    }

    this.setState(ConnectionState.Disconnected, error);
  }

  /**
   * Schedules a reconnection attempt with exponential backoff.
   *
   * Calculates backoff delay, increments retry count, and schedules the reconnection
   * callback. Updates state to Reconnecting and transitions to Failed if max retries exceeded.
   * @param connectFn - Async function to call for reconnection attempt
   * @throws Error when max reconnection attempts exceeded
   * @public
   */
  public scheduleReconnect(connectFn: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.hasRetriesLeft) {
        this.setState(ConnectionState.Failed);
        reject(new Error(`Max reconnection attempts (${this.config.maxRetries}) exceeded`));
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
   * Cancels any pending reconnection attempts.
   * @public
   */
  public cancelReconnect(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }
  }

  /**
   * Resets the retry count and cancels pending reconnections.
   *
   * Useful when manually reconnecting or after a successful manual connection.
   * @public
   */
  public reset(): void {
    this.retryCount = 0;
    this.cancelReconnect();
    this.setState(ConnectionState.Disconnected);
  }

  /**
   * Gets the current retry attempt count.
   * @returns Current retry attempt count
   * @public
   */
  public getAttemptCount(): number {
    return this.retryCount;
  }

  /**
   * Schedules reconnection (simple wrapper for scheduleReconnect).
   *
   * Fire-and-forget version that swallows errors since state transitions
   * to Failed are observable via state change handlers.
   * @param reconnectFn - Function to call for reconnection
   * @public
   */
  public scheduleReconnection(reconnectFn: () => void | Promise<void>): void {
    this.scheduleReconnect(async () => {
      await reconnectFn();
    }).catch(() => {
      // Error already handled via state change to Failed
    });
  }

  /**
   * Cancels reconnection (alias for cancelReconnect for compatibility).
   * @public
   */
  public cancel(): void {
    this.cancelReconnect();
  }

  /**
   * Registers a state change handler.
   * @param handler - Callback invoked on each state transition
   * @public
   */
  public onStateChange(handler: (event: ConnectionStateChange) => void): void {
    this.stateChangeHandlers.push(handler);
  }

  /**
   * Removes a state change handler.
   * @param handler - Handler to remove
   * @public
   */
  public removeStateChangeHandler(handler: (event: ConnectionStateChange) => void): void {
    const index = this.stateChangeHandlers.indexOf(handler);
    if (index >= 0) {
      this.stateChangeHandlers.splice(index, 1);
    }
  }

  /**
   * Cleans up resources and cancels pending reconnections.
   *
   * Call this when the connection is being permanently closed.
   * @public
   */
  public destroy(): void {
    this.cancelReconnect();
    this.stateChangeHandlers.length = 0;
  }
}
