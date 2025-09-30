/**
 * Mock EventSource implementation for testing SSE transports
 *
 * This mock provides:
 * - Controllable readyState
 * - Event emission simulation
 * - Error injection capability
 * - Connection lifecycle management
 *
 * Pattern follows MockWebSocket implementation for consistency
 */

import { EventEmitter } from 'events';

export interface MockEventSourceInit {
  withCredentials?: boolean;
}

export interface MockMessageEvent {
  data: string;
  lastEventId?: string;
  type?: string;
}

export interface MockErrorEvent {
  message?: string;
  error?: Error;
}

/**
 * Mock EventSource class that simulates SSE connection behavior
 * Implements the same interface as the real EventSource for drop-in replacement in tests
 */
export class MockEventSource extends EventEmitter {
  // EventSource readyState constants
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSED = 2;

  // Instance constants
  public readonly CONNECTING = 0;
  public readonly OPEN = 1;
  public readonly CLOSED = 2;

  // EventSource properties
  public readyState: 0 | 1 | 2 = MockEventSource.CONNECTING;
  public readonly url: string;
  public readonly withCredentials: boolean;

  // Event handlers
  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MockMessageEvent) => void) | null = null;
  public onerror: ((event: MockErrorEvent) => void) | null = null;

  // Test utilities
  public lastEventId = '';
  public connectionAttempts = 0;
  public shouldReconnect = true;
  private reconnectionTimer?: NodeJS.Timeout;
  private simulateConnectionDelay = 10; // milliseconds

  constructor(url: string | URL, init?: MockEventSourceInit) {
    super();
    this.url = typeof url === 'string' ? url : url.toString();
    this.withCredentials = init?.withCredentials || false;

    // Simulate async connection
    setTimeout(() => {
      this.connectionAttempts++;
      if (this.shouldReconnect) {
        this.readyState = MockEventSource.OPEN;
        this.emit('open', new Event('open'));
        if (this.onopen) {
          this.onopen(new Event('open'));
        }
      }
    }, this.simulateConnectionDelay);
  }

  /**
   * Close the EventSource connection
   */
  close(): void {
    if (this.readyState === MockEventSource.CLOSED) {
      return;
    }

    this.readyState = MockEventSource.CLOSED;
    this.clearReconnectionTimer();

    // EventSource doesn't emit close event on manual close
    // Only on error conditions
  }

  /**
   * Simulate receiving an SSE message
   * @param data
   * @param eventType
   * @param id
   */
  simulateMessage(data: string, eventType = 'message', id?: string): void {
    if (this.readyState !== MockEventSource.OPEN) {
      return;
    }

    if (id !== undefined) {
      this.lastEventId = id;
    }

    const event: MockMessageEvent = {
      data,
      lastEventId: this.lastEventId,
      type: eventType,
    };

    this.emit('message', event);
    if (this.onmessage) {
      this.onmessage(event);
    }
  }

  /**
   * Simulate an error condition
   * @param error
   * @param shouldReconnect
   */
  simulateError(error?: Error | string, shouldReconnect = true): void {
    const errorEvent: MockErrorEvent = {
      message: typeof error === 'string' ? error : error?.message,
      error: typeof error === 'string' ? new Error(error) : error,
    };

    this.emit('error', errorEvent);
    if (this.onerror) {
      this.onerror(errorEvent);
    }

    if (shouldReconnect && this.shouldReconnect) {
      this.readyState = MockEventSource.CONNECTING;
      this.scheduleReconnection();
    } else {
      this.readyState = MockEventSource.CLOSED;
    }
  }

  /**
   * Simulate connection failure
   */
  simulateConnectionFailure(): void {
    this.readyState = MockEventSource.CLOSED;
    this.simulateError('Connection failed', false);
  }

  /**
   * Simulate network disconnection with automatic reconnection
   */
  simulateDisconnection(): void {
    if (this.readyState === MockEventSource.OPEN) {
      this.readyState = MockEventSource.CONNECTING;
      this.scheduleReconnection();
    }
  }

  /**
   * Control whether the mock should attempt reconnections
   * @param shouldReconnect
   */
  setReconnectionBehavior(shouldReconnect: boolean): void {
    this.shouldReconnect = shouldReconnect;
    if (!shouldReconnect) {
      this.clearReconnectionTimer();
    }
  }

  /**
   * Set custom connection delay for testing timing scenarios
   * @param delayMs
   */
  setConnectionDelay(delayMs: number): void {
    this.simulateConnectionDelay = delayMs;
  }

  /**
   * Get connection statistics for testing
   */
  getConnectionStats(): {
    attempts: number;
    readyState: 0 | 1 | 2;
    url: string;
    withCredentials: boolean;
  } {
    return {
      attempts: this.connectionAttempts,
      readyState: this.readyState,
      url: this.url,
      withCredentials: this.withCredentials,
    };
  }

  private scheduleReconnection(): void {
    this.clearReconnectionTimer();

    this.reconnectionTimer = setTimeout(() => {
      if (
        this.shouldReconnect &&
        this.readyState === MockEventSource.CONNECTING
      ) {
        this.connectionAttempts++;
        this.readyState = MockEventSource.OPEN;
        this.emit('open', new Event('open'));
        if (this.onopen) {
          this.onopen(new Event('open'));
        }
      }
    }, this.simulateConnectionDelay);
  }

  private clearReconnectionTimer(): void {
    if (this.reconnectionTimer) {
      clearTimeout(this.reconnectionTimer);
      this.reconnectionTimer = undefined;
    }
  }

  // EventTarget interface implementation
  addEventListener(type: string, listener: (...args: unknown[]) => void): void {
    this.on(type, listener);
  }

  removeEventListener(
    type: string,
    listener: (...args: unknown[]) => void,
  ): void {
    this.off(type, listener);
  }

  dispatchEvent(event: Event): boolean {
    this.emit(event.type, event);
    return true;
  }
}

/**
 * Factory function for creating MockEventSource instances
 * Useful for mocking the global EventSource constructor
 * @param url - URL string or object
 * @param init
 */
export function createMockEventSource(
  url: string | URL,
  init?: MockEventSourceInit,
): MockEventSource {
  return new MockEventSource(url, init);
}

/**
 * Create a mock EventSource constructor for vi.mock()
 */
export function createMockEventSourceConstructor(): typeof MockEventSource {
  const MockConstructor = class extends MockEventSource {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSED = 2;
  };

  // Set static properties
  Object.assign(MockConstructor, {
    CONNECTING: MockEventSource.CONNECTING,
    OPEN: MockEventSource.OPEN,
    CLOSED: MockEventSource.CLOSED,
  });

  return MockConstructor;
}
