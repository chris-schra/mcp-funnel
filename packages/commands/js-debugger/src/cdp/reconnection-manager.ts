import { EventEmitter } from 'events';

/**
 * Manages automatic reconnection logic with exponential backoff
 */
export class ReconnectionManager {
  private reconnectAttempts = 0;
  private reconnectTimeout: NodeJS.Timeout | null = null;

  public constructor(
    private readonly maxAttempts: number,
    private readonly baseDelay: number,
    private readonly emitter: EventEmitter,
  ) {}

  /**
   * Schedule automatic reconnection with exponential backoff
   */
  public scheduleReconnection(
    reconnectFn: () => Promise<void>,
    onMaxAttempts: () => void,
  ): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }

    const delay = this.baseDelay * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.emitter.emit('reconnecting', {
      attempt: this.reconnectAttempts,
      delay,
    });

    this.reconnectTimeout = setTimeout(async () => {
      try {
        await reconnectFn();
        this.emitter.emit('reconnected');
        this.reset();
      } catch (error) {
        this.emitter.emit(
          'error',
          new Error(
            `Reconnection attempt ${this.reconnectAttempts} failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );

        if (this.reconnectAttempts < this.maxAttempts) {
          this.scheduleReconnection(reconnectFn, onMaxAttempts);
        } else {
          this.emitter.emit(
            'error',
            new Error('Max reconnection attempts reached'),
          );
          onMaxAttempts();
        }
      }
    }, delay);
  }

  /**
   * Cancel any pending reconnection
   */
  public cancel(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  /**
   * Reset reconnection state
   */
  public reset(): void {
    this.reconnectAttempts = 0;
    this.cancel();
  }

  /**
   * Get current attempt count
   */
  public getAttemptCount(): number {
    return this.reconnectAttempts;
  }

  /**
   * Check if within max attempts
   */
  public canRetry(): boolean {
    return this.reconnectAttempts < this.maxAttempts;
  }
}
