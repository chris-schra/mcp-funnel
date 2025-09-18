/**
 * Tests for StreamableHTTPClientTransport
 *
 * Test Categories:
 * 1. Configuration: URL validation, defaults, auth provider integration
 * 2. Connection Management: Start/stop lifecycle, error handling
 * 3. Message Sending: HTTP POST for outgoing messages
 * 4. Auth Integration: Auth headers, token refresh, OAuth flow
 * 5. Resumption Tokens: Handling resumption tokens for long-running requests
 * 6. Error Scenarios: Network errors, HTTP status codes, auth failures
 * 7. SDK Integration: Proper delegation to underlying SDK transport
 * 8. Session Management: Session ID handling and termination
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
} from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPClientTransport } from '../../src/transports/implementations/streamable-http-client-transport.js';
import { TransportError } from '../../src/transports/errors/transport-error.js';
import { v4 as uuidv4 } from 'uuid';

// Mock the SDK's StreamableHTTPClientTransport
const mockSDKTransport = {
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
  onmessage: undefined as
    | ((message: JSONRPCRequest | JSONRPCResponse) => void)
    | undefined,
};

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi
    .fn()
    .mockImplementation(() => mockSDKTransport),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(),
}));

// Mock logger
vi.mock('../../src/logger.js', () => ({
  logEvent: vi.fn(),
}));

// Mock auth provider for testing
interface MockAuthProvider {
  getAuthHeaders: ReturnType<typeof vi.fn>;
  refreshToken?: ReturnType<typeof vi.fn>;
}

describe('StreamableHTTPClientTransport', () => {
  let mockAuthProvider: MockAuthProvider;
  let uuidCounter = 0;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset UUID counter and setup mock
    uuidCounter = 0;
    (uuidv4 as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      () => `test-uuid-${++uuidCounter}`,
    );

    // Reset SDK transport mock
    Object.assign(mockSDKTransport, {
      start: vi.fn(),
      close: vi.fn(),
      send: vi.fn(),
      finishAuth: vi.fn(),
      terminateSession: vi.fn(),
      setProtocolVersion: vi.fn(),
      sessionId: undefined,
      protocolVersion: undefined,
      onclose: undefined,
      onerror: undefined,
      onmessage: undefined,
    });

    // Setup mock auth provider
    mockAuthProvider = {
      getAuthHeaders: vi
        .fn()
        .mockResolvedValue({ Authorization: 'Bearer test-token' }),
      refreshToken: vi.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Configuration and Validation', () => {
    it('should accept valid HTTP URL', () => {
      expect(() => {
        new StreamableHTTPClientTransport({
          url: 'http://localhost:8080/api',
        });
      }).not.toThrow();
    });

    it('should accept valid HTTPS URL', () => {
      expect(() => {
        new StreamableHTTPClientTransport({
          url: 'https://api.example.com/mcp',
        });
      }).not.toThrow();
    });

    it('should reject invalid URL', () => {
      expect(() => {
        new StreamableHTTPClientTransport({
          url: 'invalid-url',
        });
      }).toThrow(TransportError);
    });

    it('should reject WebSocket URLs', () => {
      expect(() => {
        new StreamableHTTPClientTransport({
          url: 'ws://localhost:8080/ws',
        });
      }).toThrow('StreamableHTTP URL must use http: or https: protocol');
    });

    it('should apply default timeout', () => {
      const transport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
      });

      expect(transport).toBeDefined();
      // Timeout is applied internally - we just verify transport is created successfully
    });

    it('should accept custom timeout', () => {
      const transport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
        timeout: 60000,
      });

      expect(transport).toBeDefined();
    });

    it('should accept session ID', () => {
      const transport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
        sessionId: 'test-session-123',
      });

      expect(transport).toBeDefined();
    });

    it('should accept auth provider', () => {
      const transport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
        authProvider: mockAuthProvider,
      });

      expect(transport).toBeDefined();
    });

    it('should accept reconnect configuration', () => {
      const transport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
        reconnect: {
          maxAttempts: 5,
          initialDelayMs: 2000,
          maxDelayMs: 60000,
          backoffMultiplier: 3,
        },
      });

      expect(transport).toBeDefined();
    });
  });

  describe('Connection Management', () => {
    let transport: StreamableHTTPClientTransport;

    beforeEach(() => {
      transport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
        authProvider: mockAuthProvider,
      });
    });

    it('should start connection successfully', async () => {
      mockSDKTransport.start.mockResolvedValue(undefined);
      mockSDKTransport.sessionId = 'session-123';

      await transport.start();

      expect(mockSDKTransport.start).toHaveBeenCalledOnce();
      expect(transport.sessionId).toBe('session-123');
    });

    it('should handle start failure', async () => {
      const error = new Error('Connection failed');
      mockSDKTransport.start.mockRejectedValue(error);

      await expect(transport.start()).rejects.toThrow(TransportError);
    });

    it('should not start twice', async () => {
      mockSDKTransport.start.mockResolvedValue(undefined);

      await transport.start();
      await transport.start(); // Should not call start again

      expect(mockSDKTransport.start).toHaveBeenCalledOnce();
    });

    it('should close connection successfully', async () => {
      mockSDKTransport.close.mockResolvedValue(undefined);

      await transport.close();

      expect(mockSDKTransport.close).toHaveBeenCalledOnce();
    });

    it('should handle close failure', async () => {
      const error = new Error('Close failed');
      mockSDKTransport.close.mockRejectedValue(error);

      await expect(transport.close()).rejects.toThrow(error);
    });

    it('should not close twice', async () => {
      mockSDKTransport.close.mockResolvedValue(undefined);

      await transport.close();
      await transport.close(); // Should not call close again

      expect(mockSDKTransport.close).toHaveBeenCalledOnce();
    });

    it('should throw error when starting closed transport', async () => {
      mockSDKTransport.close.mockResolvedValue(undefined);
      await transport.close();

      await expect(transport.start()).rejects.toThrow(
        'Transport is closed and cannot be restarted',
      );
    });
  });

  describe('Message Sending', () => {
    let transport: StreamableHTTPClientTransport;

    beforeEach(async () => {
      transport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
        authProvider: mockAuthProvider,
      });

      mockSDKTransport.start.mockResolvedValue(undefined);
      await transport.start();
    });

    it('should send JSON-RPC request', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-1',
        method: 'test/method',
        params: { data: 'test' },
      };

      mockSDKTransport.send.mockResolvedValue(undefined);

      await transport.send(request);

      expect(mockSDKTransport.send).toHaveBeenCalledWith(request, undefined);
    });

    it('should send JSON-RPC response', async () => {
      const response: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: 'test-1',
        result: { success: true },
      };

      mockSDKTransport.send.mockResolvedValue(undefined);

      await transport.send(response);

      expect(mockSDKTransport.send).toHaveBeenCalledWith(response, undefined);
    });

    it('should handle send options', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-1',
        method: 'test/method',
      };

      const options = {
        resumptionToken: 'token-123',
        onresumptiontoken: vi.fn(),
      };

      mockSDKTransport.send.mockResolvedValue(undefined);

      await transport.send(request, options);

      expect(mockSDKTransport.send).toHaveBeenCalledWith(request, options);
    });

    it('should throw error when transport not started', async () => {
      const notStartedTransport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
      });

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-1',
        method: 'test/method',
      };

      await expect(notStartedTransport.send(request)).rejects.toThrow(
        'Transport not started',
      );
    });

    it('should throw error when transport closed', async () => {
      mockSDKTransport.close.mockResolvedValue(undefined);
      await transport.close();

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-1',
        method: 'test/method',
      };

      await expect(transport.send(request)).rejects.toThrow(
        'Transport is closed',
      );
    });

    it('should handle send failure', async () => {
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-1',
        method: 'test/method',
      };

      const error = new Error('Send failed');
      mockSDKTransport.send.mockRejectedValue(error);

      await expect(transport.send(request)).rejects.toThrow(TransportError);
    });
  });

  describe('Auth Integration', () => {
    it('should finish OAuth authorization', async () => {
      const transport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
        authProvider: mockAuthProvider,
      });

      mockSDKTransport.finishAuth.mockResolvedValue(undefined);

      await transport.finishAuth('auth-code-123');

      expect(mockSDKTransport.finishAuth).toHaveBeenCalledWith('auth-code-123');
    });

    it('should handle OAuth authorization failure', async () => {
      const transport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
        authProvider: mockAuthProvider,
      });

      const error = new Error('Auth failed');
      mockSDKTransport.finishAuth.mockRejectedValue(error);

      await expect(transport.finishAuth('auth-code-123')).rejects.toThrow(
        TransportError,
      );
    });
  });

  describe('Session Management', () => {
    let transport: StreamableHTTPClientTransport;

    beforeEach(() => {
      transport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
        sessionId: 'initial-session',
      });
    });

    it('should terminate session', async () => {
      mockSDKTransport.terminateSession.mockResolvedValue(undefined);

      await transport.terminateSession();

      expect(mockSDKTransport.terminateSession).toHaveBeenCalledOnce();
    });

    it('should handle session termination failure', async () => {
      const error = new Error('Termination failed');
      mockSDKTransport.terminateSession.mockRejectedValue(error);

      await expect(transport.terminateSession()).rejects.toThrow(error);
    });

    it('should get session ID from SDK transport after start', async () => {
      mockSDKTransport.start.mockResolvedValue(undefined);
      mockSDKTransport.sessionId = 'new-session-123';

      await transport.start();

      expect(transport.sessionId).toBe('new-session-123');
    });

    it('should get protocol version from SDK transport', () => {
      mockSDKTransport.protocolVersion = '2024-11-05';

      expect(transport.protocolVersion).toBe('2024-11-05');
    });

    it('should set protocol version on SDK transport', () => {
      transport.setProtocolVersion?.('2024-11-05');

      expect(mockSDKTransport.setProtocolVersion).toHaveBeenCalledWith(
        '2024-11-05',
      );
    });
  });

  describe('Event Handling', () => {
    let transport: StreamableHTTPClientTransport;

    beforeEach(() => {
      transport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
      });
    });

    it('should handle SDK onmessage event', () => {
      const onMessage = vi.fn();
      transport.onmessage = onMessage;

      const message: JSONRPCResponse = {
        jsonrpc: '2.0',
        id: 'test',
        result: {},
      };
      mockSDKTransport.onmessage?.(message);

      expect(onMessage).toHaveBeenCalledWith(message);
    });

    it('should handle SDK onerror event', () => {
      const onError = vi.fn();
      transport.onerror = onError;

      const error = new Error('Test error');
      mockSDKTransport.onerror?.(error);

      expect(onError).toHaveBeenCalledWith(error);
    });

    it('should handle SDK onclose event when transport is closed', async () => {
      const onClose = vi.fn();
      transport.onclose = onClose;

      // Close transport - this should trigger onclose callback
      mockSDKTransport.close.mockResolvedValue(undefined);
      await transport.close();

      expect(onClose).toHaveBeenCalledOnce();
    });

    it('should not trigger onclose when transport is not closed', () => {
      const onClose = vi.fn();
      transport.onclose = onClose;

      // Trigger SDK onclose without closing transport first
      mockSDKTransport.onclose?.();

      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('Error Scenarios', () => {
    it('should handle URL construction failure', () => {
      expect(() => {
        new StreamableHTTPClientTransport({
          url: '',
        });
      }).toThrow('URL is required for StreamableHTTP transport');
    });

    it('should handle SDK transport creation failure', () => {
      // Mock URL constructor to throw
      const originalURL = global.URL;
      global.URL = vi.fn().mockImplementation(() => {
        throw new Error('Invalid URL');
      }) as unknown as typeof URL;

      expect(() => {
        new StreamableHTTPClientTransport({
          url: 'https://api.example.com/mcp',
        });
      }).toThrow(TransportError);

      // Restore URL constructor
      global.URL = originalURL;
    });
  });
});
