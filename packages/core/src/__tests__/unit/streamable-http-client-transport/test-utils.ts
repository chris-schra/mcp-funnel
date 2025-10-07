/**
 * Shared test utilities for StreamableHTTPClientTransport tests
 *
 * IMPORTANT: Import this file first in every test file to ensure mocks are properly set up
 */

import { vi } from 'vitest';
import type { JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';
import { v4 as uuidv4 } from 'uuid';

// Mock auth provider interface
export interface MockAuthProvider {
  getHeaders: ReturnType<typeof vi.fn>;
  refresh?: ReturnType<typeof vi.fn>;
  isValid: ReturnType<typeof vi.fn>;
}

// Create a factory for the mock SDK transport to ensure each test gets a fresh instance
/**
 * Creates a fresh mock SDK transport instance for testing.
 *
 * @returns Mock SDK transport object with all required methods and properties
 */
function createMockSDKTransport() {
  return {
    start: vi.fn(),
    close: vi.fn(),
    send: vi.fn(),
    finishAuth: vi.fn(),
    terminateSession: vi.fn(),
    setProtocolVersion: vi.fn(),
    sessionId: undefined as string | undefined,
    protocolVersion: undefined as string | undefined,
    onclose: undefined as (() => void) | undefined,
    onerror: undefined as ((error: Error) => void) | undefined,
    onmessage: undefined as ((message: JSONRPCRequest | JSONRPCResponse) => void) | undefined,
  };
}

// Export the current mock instance
export let mockSDKTransport = createMockSDKTransport();

// Mock the SDK's StreamableHTTPClientTransport
vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => {
    // Return the current mockSDKTransport instance
    return mockSDKTransport;
  }),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

// Mock logger
vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

/**
 * Setup function to be called in beforeEach.
 *
 * Clears all mocks and creates fresh instances of mock SDK transport and auth provider.
 *
 * @returns Mock auth provider instance for use in tests
 */
export function setupTestEnvironment(): MockAuthProvider {
  vi.clearAllMocks();

  // Setup UUID mock with counter
  let uuidCounter = 0;
  (uuidv4 as unknown as ReturnType<typeof vi.fn>).mockImplementation(
    () => `test-uuid-${++uuidCounter}`,
  );

  // Create a fresh mock SDK transport instance
  mockSDKTransport = createMockSDKTransport();

  // Create mock auth provider
  const mockAuthProvider: MockAuthProvider = {
    getHeaders: vi.fn().mockResolvedValue({ Authorization: 'Bearer test-token' }),
    refresh: vi.fn().mockResolvedValue(undefined),
    isValid: vi.fn().mockResolvedValue(true),
  };

  return mockAuthProvider;
}
