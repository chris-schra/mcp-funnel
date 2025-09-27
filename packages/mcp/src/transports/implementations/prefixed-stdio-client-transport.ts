import type { ChildProcess } from 'child_process';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { logger, prefixedLog } from '../../proxy/logging.js';
import type { TransportOptions } from '../../proxy/types.js';
import {
  createProcess,
  createStreamLineHandler,
  createStderrHandler,
  createStdoutHandler,
  logError,
  type HandlerArray,
  type MessageHandler,
} from '../../proxy/transport-utils.js';

/**
 * Base transport that prefixes server stderr logs and handles stdio communication
 */
export class PrefixedStdioClientTransport {
  protected readonly _serverName: string;
  protected process?: ChildProcess;
  private messageHandlers: MessageHandler[] = [];
  private errorHandlers: HandlerArray<Error> = [];
  private closeHandlers: HandlerArray = [];

  constructor(
    serverName: string,
    private options: TransportOptions,
  ) {
    this._serverName = serverName;
  }

  async start(): Promise<void> {
    try {
      this.process = createProcess(this.options);
      if (!this.process || !this.process.stdout || !this.process.stdin) {
        throw new Error(
          `Failed to start server process: ${this.options.command}`,
        );
      }

      const stdoutHandler = createStdoutHandler(
        this._serverName,
        (message: JSONRPCMessage) => {
          this.messageHandlers.forEach((handler) => handler(message));
        },
      );

      const lineHandler = createStreamLineHandler(stdoutHandler);
      this.process.stdout.on('data', (chunk) => lineHandler(chunk.toString()));

      const stderrHandler = createStderrHandler(this._serverName);
      if (this.process.stderr) {
        const stderrLineHandler = createStreamLineHandler(stderrHandler);
        this.process.stderr.on('data', (chunk) =>
          stderrLineHandler(chunk.toString()),
        );
      }

      this.process.on('error', (error) => {
        logError(this._serverName, error);
        this.errorHandlers.forEach((handler) => handler(error));
      });

      this.process.on('close', (code, signal) => {
        if (code !== 0 || signal) {
          const msg = `Server process closed unexpectedly: ${code || signal}`;
          console.error(prefixedLog(this._serverName, msg));
        } else {
          console.error(
            prefixedLog(this._serverName, 'Server process closed successfully'),
          );
        }
        this.closeHandlers.forEach((handler) => handler());
      });

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Server failed to start within timeout'));
        }, 5000);

        const listener = () => {
          clearTimeout(timeout);
          this.process?.stdout?.removeListener('data', listener);
          resolve();
        };

        this.process?.stdout?.once('data', listener);
        this.process?.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  async send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process?.stdin) {
        reject(new Error('Process stdin is not available'));
        return;
      }
      const json = JSON.stringify(message) + '\n';
      this.process.stdin.write(json, (error) => {
        error ? reject(error) : resolve();
      });
    });
  }

  async close(): Promise<void> {
    if (this.process && !this.process.killed) {
      this.process.kill();
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          this.process?.kill('SIGKILL');
          resolve();
        }, 1000);
        this.process?.once('close', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
  }

  set onmessage(handler: MessageHandler | undefined) {
    this.messageHandlers = handler ? [handler] : [];
  }
  set onerror(handler: ((error: Error) => void) | undefined) {
    this.errorHandlers = handler ? [handler] : [];
  }
  set onclose(handler: (() => void) | undefined) {
    this.closeHandlers = handler ? [handler] : [];
  }

  addMessageHandler(handler: MessageHandler): void {
    this.messageHandlers.push(handler);
  }
  addCloseHandler(handler: () => void): void {
    this.closeHandlers.push(handler);
  }
}
