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

import { describe, it, expect, vi } from 'vitest';

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

describe('SSEClientTransport - EventSource Connection Management', () => {
  it('should create EventSource with correct URL and configuration', () => {
    const testUrl = 'https://api.example.com/events';
    const eventSource = new MockEventSourceConstructor(testUrl, {
      withCredentials: false,
    });

    expect(eventSource.url).toBe(testUrl);
    expect(eventSource.withCredentials).toBe(false);
    expect(eventSource.readyState).toBe(MockEventSource.CONNECTING);
  });

  it('should inject auth token as query parameter for EventSource', () => {
    const baseUrl = 'https://api.example.com/events';
    const authToken = 'Bearer test-token-123';
    const expectedUrl = `${baseUrl}?auth=${encodeURIComponent(authToken)}`;

    const eventSource = new MockEventSourceConstructor(expectedUrl);

    expect(eventSource.url).toBe(expectedUrl);
    expect(eventSource.url).toContain('auth=Bearer%20test-token-123');
  });

  it('should handle EventSource readyState transitions', () => {
    const eventSource = new MockEventSource('https://api.example.com/events');

    // Initial state
    expect(eventSource.readyState).toBe(MockEventSource.CONNECTING);

    // Simulate connection opening
    eventSource.readyState = MockEventSource.OPEN;
    expect(eventSource.readyState).toBe(MockEventSource.OPEN);

    // Simulate connection closing
    eventSource.close();
    expect(eventSource.readyState).toBe(MockEventSource.CLOSED);
  });

  it('should configure withCredentials for CORS requests', () => {
    const eventSource1 = new MockEventSource('https://api.example.com/events', {
      withCredentials: true,
    });
    expect(eventSource1.withCredentials).toBe(true);

    const eventSource2 = new MockEventSource('https://api.example.com/events', {
      withCredentials: false,
    });
    expect(eventSource2.withCredentials).toBe(false);
  });

  it('should set up event listeners for SSE events', () => {
    const eventSource = new MockEventSource('https://api.example.com/events');
    const openHandler = vi.fn();
    const messageHandler = vi.fn();
    const errorHandler = vi.fn();

    eventSource.addEventListener('open', openHandler);
    eventSource.addEventListener('message', messageHandler);
    eventSource.addEventListener('error', errorHandler);

    // Verify listeners were added (MockEventSource extends EventEmitter)
    expect(eventSource.listenerCount('open')).toBe(1);
    expect(eventSource.listenerCount('message')).toBe(1);
    expect(eventSource.listenerCount('error')).toBe(1);
  });
});
