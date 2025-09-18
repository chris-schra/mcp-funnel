/**
 * Manages reconnection logic with exponential backoff and jitter.
 */
export interface ReconnectionConfig {
  /** Initial delay in milliseconds (default: 1000) */
  initialDelay?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Maximum number of retry attempts (default: 10) */
  maxRetries?: number;
  /** Jitter percentage as a decimal (default: 0.25 for ±25%) */
  jitter?: number;
}

export enum ConnectionState {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Reconnecting = 'reconnecting',
  Failed = 'failed',
}

export interface ConnectionStateChange {
  from: ConnectionState;
  to: ConnectionState;
  retryCount: number;
  nextRetryDelay?: number;
  error?: Error;
}

export class ReconnectionManager {
  private retryCount = 0;
  private currentState = ConnectionState.Disconnected;
  private retryTimeout?: NodeJS.Timeout;
  private config: Required<ReconnectionConfig>;
  private stateChangeHandlers: ((event: ConnectionStateChange) => void)[] = [];

  constructor(config: ReconnectionConfig = {}) {
    this.config = {
      initialDelay: config.initialDelay ?? 1000,
      maxDelay: config.maxDelay ?? 30000,
      backoffMultiplier: config.backoffMultiplier ?? 2,
      maxRetries: config.maxRetries ?? 10,
      jitter: config.jitter ?? 0.25,
    };
  }

  get state(): ConnectionState {
    return this.currentState;
  }

  get currentRetryCount(): number {
    return this.retryCount;
  }

  get hasRetriesLeft(): boolean {
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
  onConnecting(): void {
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
  onConnected(): void {
    this.retryCount = 0;
    this.setState(ConnectionState.Connected);
  }

  /**
   * Called when connection fails or is lost
   */
  onDisconnected(error?: Error): void {
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
  scheduleReconnect(connectFn: () => Promise<void>): Promise<void> {
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

      this.retryCount++;
      const delay = this.calculateNextDelay();

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
  cancelReconnect(): void {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = undefined;
    }
  }

  /**
   * Reset the retry count (useful when manually reconnecting)
   */
  reset(): void {
    this.retryCount = 0;
    this.cancelReconnect();
    this.setState(ConnectionState.Disconnected);
  }

  /**
   * Add a state change handler
   */
  onStateChange(handler: (event: ConnectionStateChange) => void): void {
    this.stateChangeHandlers.push(handler);
  }

  /**
   * Remove a state change handler
   */
  removeStateChangeHandler(
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
  destroy(): void {
    this.cancelReconnect();
    this.stateChangeHandlers.length = 0;
  }
}
