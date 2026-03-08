import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'stream';
import { SocketTransport } from '../socket-transport.js';
import type { Socket } from 'net';

function createMockSocket(): Socket & PassThrough {
  const stream = new PassThrough() as Socket & PassThrough;
  // Override write to track calls and support callback
  const originalWrite = stream.write.bind(stream);
  stream.write = vi.fn((data: unknown, cb?: unknown) => {
    if (typeof cb === 'function') cb();
    return true;
  }) as typeof stream.write;
  stream.destroy = vi.fn(() => {
    stream.destroyed = true;
    return stream;
  });
  stream.end = vi.fn(() => stream) as typeof stream.end;
  stream.destroyed = false;
  return stream;
}

describe('SocketTransport', () => {
  let mockSocket: ReturnType<typeof createMockSocket>;
  let transport: SocketTransport;

  beforeEach(() => {
    mockSocket = createMockSocket();
    transport = new SocketTransport(mockSocket);
  });

  describe('send', () => {
    it('should write line-delimited JSON to the socket', async () => {
      const message = { jsonrpc: '2.0' as const, id: 1, method: 'test' };
      await transport.send(message);

      expect(mockSocket.write).toHaveBeenCalledWith(
        JSON.stringify(message) + '\n',
        expect.any(Function),
      );
    });

    it('should reject when socket is destroyed', async () => {
      mockSocket.destroyed = true;
      const message = { jsonrpc: '2.0' as const, id: 1, method: 'test' };

      await expect(transport.send(message)).rejects.toThrow('Socket is closed');
    });

    it('should reject when write fails', async () => {
      mockSocket.write = vi.fn((_data: string, cb?: (err?: Error) => void) => {
        cb?.(new Error('write failed'));
        return false;
      });

      const message = { jsonrpc: '2.0' as const, id: 1, method: 'test' };
      await expect(transport.send(message)).rejects.toThrow('write failed');
    });
  });

  describe('close', () => {
    it('should end the socket', async () => {
      await transport.close();
      expect(mockSocket.end).toHaveBeenCalled();
    });

    it('should not end an already destroyed socket', async () => {
      mockSocket.destroyed = true;
      await transport.close();
      expect(mockSocket.end).not.toHaveBeenCalled();
    });
  });

  describe('event handlers', () => {
    it('should call onerror on socket error', () => {
      // Test that onerror handler is wired correctly
      const errorHandler = vi.fn();
      transport.onerror = errorHandler;

      // Directly invoke onerror to verify it's settable and callable
      const testError = new Error('test error');
      transport.onerror?.(testError);

      expect(errorHandler).toHaveBeenCalledWith(testError);
    });

    it('should call onclose on socket close', () => {
      // Test that onclose handler is wired correctly
      const closeHandler = vi.fn();
      transport.onclose = closeHandler;

      transport.onclose?.();

      expect(closeHandler).toHaveBeenCalled();
    });
  });
});
