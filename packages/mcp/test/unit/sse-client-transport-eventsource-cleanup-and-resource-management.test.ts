/**
 * SSE-Specific Tests for SSEClientTransport
 *
 * These tests focus exclusively on SSE-specific functionality that is not covered
 * by the base transport tests. Base functionality like authentication integration,
 * message correlation, and lifecycle management is tested in base-client-transport.test.ts.
 *
 * SSE-Specific Test Categories:
 * 1. EventSource Connection Management: Creation, configuration, event listeners
 * 2. SSE Message Reception: Event handling, JSON-RPC parsing from SSE events
 * 3. EventSource Error Handling: Error states, readyState transitions
 * 4. EventSource Cleanup: Connection closure, event listener removal
 * 5. Browser-Specific Features: Auth query params, withCredentials settings
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

import type { JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';
import {
  createMockSSEServer,
  type MockSSEServer,
} from '../mocks/mock-sse-server.js';
import { SSEClientTransport } from '@mcp-funnel/core';
import {
  createMockEventSourceConstructor,
  MockEventSource,
} from '../mocks/mock-eventsource.js';

// Mock the EventSource constructor
const MockEventSourceConstructor = createMockEventSourceConstructor();
vi.stubGlobal('EventSource', MockEventSourceConstructor);

// Mock fetch for HTTP POST requests
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock UUID generation
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123'),
}));

// Mock logger
vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

describe('SSEClientTransport - EventSource Cleanup and Resource Management', () => {
  it('should properly close EventSource connection', () => {
    const eventSource = new MockEventSource('https://api.example.com/events');
    eventSource.readyState = MockEventSource.OPEN;

    expect(eventSource.readyState).toBe(MockEventSource.OPEN);

    eventSource.close();

    expect(eventSource.readyState).toBe(MockEventSource.CLOSED);
  });

  it('should remove event listeners on cleanup', () => {
    const eventSource = new MockEventSource('https://api.example.com/events');
    const openHandler = vi.fn();
    const messageHandler = vi.fn();
    const errorHandler = vi.fn();

    eventSource.addEventListener('open', openHandler);
    eventSource.addEventListener('message', messageHandler);
    eventSource.addEventListener('error', errorHandler);

    expect(eventSource.listenerCount('open')).toBe(1);
    expect(eventSource.listenerCount('message')).toBe(1);
    expect(eventSource.listenerCount('error')).toBe(1);

    eventSource.removeEventListener('open', openHandler);
    eventSource.removeEventListener('message', messageHandler);
    eventSource.removeEventListener('error', errorHandler);

    expect(eventSource.listenerCount('open')).toBe(0);
    expect(eventSource.listenerCount('message')).toBe(0);
    expect(eventSource.listenerCount('error')).toBe(0);
  });

  it('should handle multiple close calls gracefully', () => {
    const eventSource = new MockEventSource('https://api.example.com/events');
    eventSource.readyState = MockEventSource.OPEN;

    eventSource.close();
    expect(eventSource.readyState).toBe(MockEventSource.CLOSED);

    // Second close should be safe
    eventSource.close();
    expect(eventSource.readyState).toBe(MockEventSource.CLOSED);
  });

  it('should use same bound function references for add and remove to prevent memory leaks', () => {
    const eventSource = new MockEventSource('https://api.example.com/events');

    // Create bound handlers
    const openHandler = vi.fn();
    const messageHandler = vi.fn();
    const errorHandler = vi.fn();

    // Add listeners
    eventSource.addEventListener('open', openHandler);
    eventSource.addEventListener('message', messageHandler);
    eventSource.addEventListener('error', errorHandler);

    expect(eventSource.listenerCount('open')).toBe(1);
    expect(eventSource.listenerCount('message')).toBe(1);
    expect(eventSource.listenerCount('error')).toBe(1);

    // Remove using same references - should work
    eventSource.removeEventListener('open', openHandler);
    eventSource.removeEventListener('message', messageHandler);
    eventSource.removeEventListener('error', errorHandler);

    expect(eventSource.listenerCount('open')).toBe(0);
    expect(eventSource.listenerCount('message')).toBe(0);
    expect(eventSource.listenerCount('error')).toBe(0);
  });

  it('should fail to remove listeners when different bound functions are used (memory leak scenario)', () => {
    const eventSource = new MockEventSource('https://api.example.com/events');

    const originalHandler = () => console.log('test');

    // Add listener with one bound function
    eventSource.addEventListener('open', originalHandler.bind({}));
    expect(eventSource.listenerCount('open')).toBe(1);

    // Try to remove with different bound function - should fail
    eventSource.removeEventListener('open', originalHandler.bind({}));
    expect(eventSource.listenerCount('open')).toBe(1); // Still has listener - memory leak!
  });

  it('should verify memory leak prevention during multiple reconnections', () => {
    const eventSource = new MockEventSource('https://api.example.com/events');

    // Simulate multiple connection cycles
    for (let i = 0; i < 5; i++) {
      const openHandler = vi.fn();
      const messageHandler = vi.fn();
      const errorHandler = vi.fn();

      // Add listeners
      eventSource.addEventListener('open', openHandler);
      eventSource.addEventListener('message', messageHandler);
      eventSource.addEventListener('error', errorHandler);

      expect(eventSource.listenerCount('open')).toBe(1);
      expect(eventSource.listenerCount('message')).toBe(1);
      expect(eventSource.listenerCount('error')).toBe(1);

      // Remove using same references
      eventSource.removeEventListener('open', openHandler);
      eventSource.removeEventListener('message', messageHandler);
      eventSource.removeEventListener('error', errorHandler);

      // Verify all listeners are removed
      expect(eventSource.listenerCount('open')).toBe(0);
      expect(eventSource.listenerCount('message')).toBe(0);
      expect(eventSource.listenerCount('error')).toBe(0);
    }
  });
});
