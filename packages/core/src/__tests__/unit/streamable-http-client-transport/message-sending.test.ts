/**
 * Message Sending tests for StreamableHTTPClientTransport
 */

// IMPORTANT: Import test-utils first to set up mocks before other imports
import { setupTestEnvironment, mockSDKTransport, type MockAuthProvider } from './test-utils.js';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { JSONRPCRequest, JSONRPCResponse } from '@modelcontextprotocol/sdk/types.js';
import { StreamableHTTPClientTransport } from '../../../transports/implementations/streamable-http-client-transport.js';
import { TransportError } from '../../../transports/errors/transport-error.js';

describe('StreamableHTTPClientTransport - Message Sending', () => {
  let transport: StreamableHTTPClientTransport;
  let mockAuthProvider: MockAuthProvider;

  beforeEach(async () => {
    mockAuthProvider = setupTestEnvironment();
    transport = new StreamableHTTPClientTransport({
      url: 'https://api.example.com/mcp',
      authProvider: mockAuthProvider,
    });

    mockSDKTransport.start.mockResolvedValue(undefined);
    await transport.start();
  });

  afterEach(() => {
    vi.clearAllTimers();
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

    await expect(notStartedTransport.send(request)).rejects.toThrow('Transport not started');
  });

  it('should throw error when transport closed', async () => {
    mockSDKTransport.close.mockResolvedValue(undefined);
    await transport.close();

    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: 'test-1',
      method: 'test/method',
    };

    await expect(transport.send(request)).rejects.toThrow('Transport is closed');
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
