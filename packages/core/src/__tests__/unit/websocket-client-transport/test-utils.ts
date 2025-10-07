/**
 * Shared utilities for WebSocketClientTransport tests
 *
 * This file contains the MockWebSocket class and helper functions.
 * Mocks must be setup at module level in each test file.
 */

import type { ClientOptions } from 'ws';
import type { ClientRequestArgs } from 'http';
import type WebSocket from 'ws';

// Mock WebSocket implementation for testing
export class MockWebSocket {
  public static readonly CONNECTING = 0;
  public static readonly OPEN = 1;
  public static readonly CLOSING = 2;
  public static readonly CLOSED = 3;

  // WebSocket required properties
  public readonly CONNECTING = 0;
  public readonly OPEN = 1;
  public readonly CLOSING = 2;
  public readonly CLOSED = 3;
  public binaryType: 'nodebuffer' | 'arraybuffer' | 'fragments' = 'nodebuffer';
  public readonly bufferedAmount = 0;
  public readonly extensions = '';
  public readonly isPaused = false;
  public readonly protocol = '';
  public readyState: 0 | 1 | 2 | 3 = MockWebSocket.CONNECTING;
  public readonly url: string;
  public onopen: ((event: WebSocket.Event) => void) | null = null;
  public onmessage: ((event: WebSocket.MessageEvent) => void) | null = null;
  public onerror: ((event: WebSocket.ErrorEvent) => void) | null = null;
  public onclose: ((event: WebSocket.CloseEvent) => void) | null = null;

  public listeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  constructor(
    url: string | URL,
    _protocols?: string | string[],
    _options?: ClientOptions | ClientRequestArgs,
  ) {
    this.url = typeof url === 'string' ? url : url.toString();
    this.listeners = {};

    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.emit('open');
    }, 10);
  }

  send(data: string): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    // Store sent data for testing purposes
    this.lastSentData = data;
  }

  public lastSentData?: string;

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      // Emit close event with Node.js ws format: (code, reason)
      this.emit('close', code || 1000, Buffer.from(reason || ''));
    }, 10);
  }

  ping(_data?: unknown, _mask?: boolean, _cb?: (err: Error) => void): void {
    // Simulate ping
  }

  pong(_data?: unknown, _mask?: boolean, _cb?: (err: Error) => void): void {
    // Simulate pong
  }

  terminate(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  pause(): void {
    // Mock implementation
  }

  resume(): void {
    // Mock implementation
  }

  addEventListener<K extends keyof WebSocket.WebSocketEventMap>(
    _type: K,
    _listener:
      | ((event: WebSocket.WebSocketEventMap[K]) => void)
      | { handleEvent(event: WebSocket.WebSocketEventMap[K]): void },
    _options?: WebSocket.EventListenerOptions,
  ): void {
    // Mock implementation
  }

  removeEventListener<K extends keyof WebSocket.WebSocketEventMap>(
    _type: K,
    _listener:
      | ((event: WebSocket.WebSocketEventMap[K]) => void)
      | { handleEvent(event: WebSocket.WebSocketEventMap[K]): void },
  ): void {
    // Mock implementation
  }

  // Simple event listener implementation
  on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(listener);
    return this;
  }

  once(event: string, listener: (...args: unknown[]) => void): this {
    const onceWrapper = (...args: unknown[]) => {
      listener(...args);
      this.removeListener(event, onceWrapper);
    };
    this.on(event, onceWrapper);
    return this;
  }

  removeListener(event: string, listener: (...args: unknown[]) => void): this {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter((l) => l !== listener);
    }
    return this;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.listeners[event] = [];
    } else {
      this.listeners = {};
    }
    return this;
  }

  off(event: string, listener: (...args: unknown[]) => void): this {
    return this.removeListener(event, listener);
  }

  addListener(event: string, listener: (...args: unknown[]) => void): this {
    return this.on(event, listener);
  }

  setMaxListeners(_n: number): this {
    return this;
  }

  getMaxListeners(): number {
    return 10;
  }

  listenerCount(_event: string): number {
    return 0;
  }

  prependListener(event: string, listener: (...args: unknown[]) => void): this {
    return this.on(event, listener);
  }

  prependOnceListener(event: string, listener: (...args: unknown[]) => void): this {
    return this.once(event, listener);
  }

  rawListeners(event: string): ((...args: unknown[]) => void)[] {
    return this.listeners[event] || [];
  }

  eventNames(): (string | symbol)[] {
    return Object.keys(this.listeners);
  }

  emit(event: string, ...args: unknown[]): boolean {
    const eventListeners = this.listeners[event];
    if (eventListeners) {
      eventListeners.forEach((listener) => listener(...args));
    }
    return eventListeners ? eventListeners.length > 0 : false;
  }
}
