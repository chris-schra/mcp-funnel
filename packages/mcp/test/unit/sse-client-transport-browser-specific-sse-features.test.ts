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


describe('SSEClientTransport - Browser-Specific SSE Features', () => {
  it('should support auth tokens via query parameters due to browser limitations', () => {
    const baseUrl = 'https://api.example.com/events';
    const authToken = 'Bearer my-secret-token';
    const encodedToken = encodeURIComponent(authToken);
    const urlWithAuth = `${baseUrl}?auth=${encodedToken}`;

    const eventSource = new MockEventSource(urlWithAuth);

    expect(eventSource.url).toBe(urlWithAuth);
    expect(eventSource.url).toContain('auth=Bearer%20my-secret-token');
  });

  it('should handle EventSource readyState constants correctly', () => {
    expect(MockEventSource.CONNECTING).toBe(0);
    expect(MockEventSource.OPEN).toBe(1);
    expect(MockEventSource.CLOSED).toBe(2);

    const eventSource = new MockEventSource('https://api.example.com/events');
    expect(eventSource.CONNECTING).toBe(0);
    expect(eventSource.OPEN).toBe(1);
    expect(eventSource.CLOSED).toBe(2);
  });

  it('should maintain last event ID for SSE reconnection', () => {
    const eventSource = new MockEventSource('https://api.example.com/events');
    eventSource.readyState = MockEventSource.OPEN; // Ensure EventSource is open

    expect(eventSource.lastEventId).toBe('');

    eventSource.simulateMessage('test data', 'message', 'event-123');
    expect(eventSource.lastEventId).toBe('event-123');

    eventSource.simulateMessage('more data', 'message', 'event-456');
    expect(eventSource.lastEventId).toBe('event-456');
  });

  it('should control reconnection behavior for testing', () => {
    const eventSource = new MockEventSource('https://api.example.com/events');

    expect(eventSource.shouldReconnect).toBe(true);

    eventSource.setReconnectionBehavior(false);
    expect(eventSource.shouldReconnect).toBe(false);

    eventSource.setReconnectionBehavior(true);
    expect(eventSource.shouldReconnect).toBe(true);
  });
});
