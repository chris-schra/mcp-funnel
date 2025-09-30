/**
 * Tests for reconnection manager integration and lifecycle management
 */

import { describe, it, expect, vi } from 'vitest';
import {
  setupBaseClientTransportTest,
  TransportError,
  type JSONRPCRequest,
} from './test-utils.js';

describe('BaseClientTransport', () => {
  const { transport } = setupBaseClientTransportTest();

  describe('Reconnection Manager Integration', () => {
    it('resets reconnection attempts on successful connection', () => {
      const manager = transport.getReconnectionManager();
      const resetSpy = vi.spyOn(manager, 'reset');

      transport.testHandleConnectionError(new Error('Test error'));
      transport['handleConnectionOpen']();

      expect(resetSpy).toHaveBeenCalled();
    });

    it('schedules reconnection on retryable errors', () => {
      const manager = transport.getReconnectionManager();
      const scheduleSpy = vi.spyOn(manager, 'scheduleReconnection');

      const retryableError = TransportError.connectionFailed('Network error');
      transport.testHandleConnectionError(retryableError);

      expect(scheduleSpy).toHaveBeenCalled();
    });

    it('does not schedule reconnection for non-retryable errors', () => {
      const manager = transport.getReconnectionManager();
      const scheduleSpy = vi.spyOn(manager, 'scheduleReconnection');

      const nonRetryableError =
        TransportError.authenticationFailed('Auth error');
      transport.testHandleConnectionError(nonRetryableError);

      expect(scheduleSpy).not.toHaveBeenCalled();
    });

    it('cancels reconnection on transport close', async () => {
      const manager = transport.getReconnectionManager();
      const cancelSpy = vi.spyOn(manager, 'cancel');

      await transport.close();

      expect(cancelSpy).toHaveBeenCalled();
    });
  });

  describe('Lifecycle Management', () => {
    it('starts transport and establishes connection', async () => {
      expect(transport['isStarted']).toBe(false);

      await transport.start();

      expect(transport['isStarted']).toBe(true);
      expect(transport.connectCalls).toBe(1);
    });

    it('prevents multiple starts', async () => {
      await transport.start();
      await transport.start(); // Second call should be no-op

      expect(transport.connectCalls).toBe(1);
    });

    it('closes transport and cleans up resources', async () => {
      await transport.start();

      // Add a pending request
      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test/method',
        params: {},
      };

      // Start the send but don't wait for it - we'll close the transport instead
      const sendPromise = transport.send(request);
      expect(transport.getPendingRequests().size).toBe(1);

      // Close the transport which should reject pending requests
      await transport.close();

      // The send promise should be rejected due to transport closure
      await expect(sendPromise).rejects.toThrow('Transport closed');

      expect(transport['isClosed']).toBe(true);
      expect(transport['isStarted']).toBe(false);
      expect(transport.closeCalls).toBe(1);
      expect(transport.getPendingRequests().size).toBe(0);
    });

    it('prevents operations on closed transport', async () => {
      await transport.close();

      const request: JSONRPCRequest = {
        jsonrpc: '2.0',
        id: 'test-id',
        method: 'test/method',
        params: {},
      };

      await expect(transport.send(request)).rejects.toThrow(
        'Transport is closed',
      );
    });

    it('generates session ID on connection', async () => {
      await transport.start();
      expect(transport.sessionId).toBe('mock-uuid-1234');
    });
  });
});
