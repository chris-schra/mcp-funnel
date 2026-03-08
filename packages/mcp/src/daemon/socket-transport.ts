import { createInterface } from 'readline';
import type { Socket } from 'net';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

/**
 * MCP Transport implementation over a Unix domain socket.
 * Handles line-delimited JSON-RPC messages, matching the stdio protocol format.
 */
export class SocketTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(private socket: Socket) {}

  async start(): Promise<void> {
    const rl = createInterface({ input: this.socket, crlfDelay: Infinity });

    rl.on('line', (line) => {
      if (!line.trim()) return;
      try {
        const message = JSON.parse(line) as JSONRPCMessage;
        this.onmessage?.(message);
      } catch {
        this.onerror?.(new Error(`Failed to parse JSON-RPC message: ${line.slice(0, 200)}`));
      }
    });

    this.socket.on('error', (error) => {
      this.onerror?.(error);
    });

    this.socket.on('close', () => {
      rl.close();
      this.onclose?.();
    });
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.socket.destroyed) {
      throw new Error('Socket is closed');
    }
    return new Promise((resolve, reject) => {
      this.socket.write(JSON.stringify(message) + '\n', (error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (!this.socket.destroyed) {
      this.socket.end();
    }
  }
}
