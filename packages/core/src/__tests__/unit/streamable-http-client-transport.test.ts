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
import { StreamableHTTPClientTransport } from '../../transports/implementations/streamable-http-client-transport.js';
import { TransportError } from '../../transports/errors/transport-error.js';
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
vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

// Mock auth provider for testing
interface MockAuthProvider {
  getHeaders: ReturnType<typeof vi.fn>;
  refresh?: ReturnType<typeof vi.fn>;
  isValid: ReturnType<typeof vi.fn>;
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
      getHeaders: vi
        .fn()
        .mockResolvedValue({ Authorization: 'Bearer test-token' }),
      refresh: vi.fn().mockResolvedValue(undefined),
      isValid: vi.fn().mockResolvedValue(true),
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

  describe('Transport Replacement and Upgrades', () => {
    let transport: StreamableHTTPClientTransport;

    beforeEach(() => {
      transport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
        authProvider: mockAuthProvider,
      });
    });

    it('should preserve auth headers during transport upgrade', async () => {
      // Start transport to establish auth headers
      mockSDKTransport.start.mockResolvedValue(undefined);
      mockSDKTransport.sessionId = 'session-123';
      await transport.start();

      // Verify auth headers were retrieved and stored
      expect(mockAuthProvider.getHeaders).toHaveBeenCalledOnce();

      // Upgrade transport
      await transport.upgradeTransport('websocket');

      // Should have created new transport with preserved auth headers
      // The createSDKTransport should be called with auth headers included
      expect(mockSDKTransport.start).toHaveBeenCalledTimes(2); // Once for initial start, once for upgrade
    });

    it('should properly close old transport during upgrade', async () => {
      mockSDKTransport.start.mockResolvedValue(undefined);
      mockSDKTransport.close.mockResolvedValue(undefined);
      await transport.start();

      // Reset the close mock after start to track only upgrade calls
      mockSDKTransport.close.mockClear();

      await transport.upgradeTransport('sse');

      // Old transport should have been closed during upgrade
      expect(mockSDKTransport.close).toHaveBeenCalledOnce();
    });

    it('should handle transport upgrade when not started', async () => {
      // Upgrade without starting first
      await transport.upgradeTransport('websocket');

      // Should not try to start the new transport since original wasn't started
      expect(mockSDKTransport.start).not.toHaveBeenCalled();
    });

    it('should throw error when upgrading closed transport', async () => {
      mockSDKTransport.close.mockResolvedValue(undefined);
      await transport.close();

      await expect(transport.upgradeTransport('websocket')).rejects.toThrow(
        'Cannot upgrade closed transport',
      );
    });

    it('should preserve session ID after upgrade', async () => {
      mockSDKTransport.start.mockResolvedValue(undefined);
      mockSDKTransport.sessionId = 'initial-session';
      await transport.start();

      expect(transport.sessionId).toBe('initial-session');

      // After upgrade, should get new session ID
      mockSDKTransport.sessionId = 'upgraded-session';
      await transport.upgradeTransport('sse');

      expect(transport.sessionId).toBe('upgraded-session');
    });

    it('should handle errors during old transport cleanup gracefully', async () => {
      mockSDKTransport.start.mockResolvedValue(undefined);
      await transport.start();

      // Make old transport close throw an error
      mockSDKTransport.close.mockRejectedValue(new Error('Close failed'));

      // Upgrade should still succeed despite cleanup error
      await expect(
        transport.upgradeTransport('websocket'),
      ).resolves.not.toThrow();
    });

    it('should setup callbacks on new transport after replacement', async () => {
      mockSDKTransport.start.mockResolvedValue(undefined);
      await transport.start();

      const onMessage = vi.fn();
      const onError = vi.fn();
      const onClose = vi.fn();

      transport.onmessage = onMessage;
      transport.onerror = onError;
      transport.onclose = onClose;

      await transport.upgradeTransport('websocket');

      // Callbacks should be set up on the new transport
      expect(mockSDKTransport.onmessage).toBeDefined();
      expect(mockSDKTransport.onerror).toBeDefined();
      expect(mockSDKTransport.onclose).toBeDefined();
    });
  });

  describe('Auth Header Preservation', () => {
    let transport: StreamableHTTPClientTransport;

    beforeEach(() => {
      transport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
        authProvider: mockAuthProvider,
      });
    });

    it('should store auth headers during start', async () => {
      const authHeaders = {
        Authorization: 'Bearer test-token',
        'X-API-Key': 'key123',
      };
      mockAuthProvider.getHeaders.mockResolvedValue(authHeaders);
      mockSDKTransport.start.mockResolvedValue(undefined);

      await transport.start();

      expect(mockAuthProvider.getHeaders).toHaveBeenCalledOnce();
      // Auth headers should be stored internally for later use
    });

    it('should use stored auth headers during upgrade', async () => {
      const authHeaders = { Authorization: 'Bearer test-token' };
      mockAuthProvider.getHeaders.mockResolvedValue(authHeaders);
      mockSDKTransport.start.mockResolvedValue(undefined);

      await transport.start();

      // Clear the mock to ensure it's not called again during upgrade
      mockAuthProvider.getHeaders.mockClear();

      await transport.upgradeTransport('websocket');

      // Auth provider should not be called again - stored headers should be used
      expect(mockAuthProvider.getHeaders).not.toHaveBeenCalled();
    });

    it('should start without auth headers when no auth provider', async () => {
      const noAuthTransport = new StreamableHTTPClientTransport({
        url: 'https://api.example.com/mcp',
      });

      mockSDKTransport.start.mockResolvedValue(undefined);

      await noAuthTransport.start();

      expect(mockSDKTransport.start).toHaveBeenCalledOnce();
      // Should not have tried to get auth headers
      expect(mockAuthProvider.getHeaders).not.toHaveBeenCalled();
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
