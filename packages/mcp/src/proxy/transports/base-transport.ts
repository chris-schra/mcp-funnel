import { spawn, type ChildProcess } from 'child_process';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { logger, logServerStream, prefixedLog } from '../logging.js';
import type { TransportOptions } from '../types.js';
import { createStreamHandler } from '../util/stream-handlers.js';
import { setupProcessHandlers } from '../util/process-handlers.js';

/**
 * Base transport that prefixes server stderr logs and handles stdio communication
 */
export class PrefixedStdioClientTransport {
  protected readonly _serverName: string;
  protected process?: ChildProcess;
  private messageHandlers: ((message: JSONRPCMessage) => void)[] = [];
  private errorHandlers: ((error: Error) => void)[] = [];
  private closeHandlers: (() => void)[] = [];

  public constructor(
    serverName: string,
    private options: TransportOptions,
  ) {
    this._serverName = serverName;
  }

  public async start(): Promise<void> {
    try {
      // Spawn the process with full control over stdio
      this.process = spawn(this.options.command, this.options.args || [], {
        env: this.options.env,
        stdio: ['pipe', 'pipe', 'pipe'], // Full control over all streams
        cwd: process.cwd(), // Explicitly set cwd
      });

      logger.debug('transport:start', {
        server: this._serverName,
        command: this.options.command,
        args: this.options.args,
      });
    } catch (error) {
      const errorMsg = prefixedLog(this._serverName, `Failed to spawn process: ${error}`);
      logger.error(errorMsg, error, {
        server: this._serverName,
        context: 'spawn-failed',
        command: this.options.command,
        args: this.options.args,
      });
      throw error;
    }

    // Set up stream handlers
    this.setupStreamHandlers();

    // Handle process errors and exit
    this.setupProcessHandlersInternal();
  }

  private setupStreamHandlers(): void {
    if (!this.process) return;

    // Handle stderr with prefixing
    if (this.process.stderr) {
      createStreamHandler({
        serverName: this._serverName,
        stream: this.process.stderr,
        streamType: 'stderr',
        onLine: (line) => {
          console.error(prefixedLog(this._serverName, line));
          logServerStream(this._serverName, 'stderr', line);
        },
      });
    }

    // Handle stdout for MCP protocol messages
    if (this.process.stdout) {
      createStreamHandler({
        serverName: this._serverName,
        stream: this.process.stdout,
        streamType: 'stdout',
        onLine: (line) => {
          try {
            const message = JSON.parse(line) as JSONRPCMessage;
            this.messageHandlers.forEach((handler) => handler(message));
          } catch {
            // Not a JSON message, might be a log line that went to stdout
            console.error(prefixedLog(this._serverName, line));
            logServerStream(this._serverName, 'stdout', line);
            logger.debug('transport:nonjson_stdout', {
              server: this._serverName,
              line: line.slice(0, 200),
            });
          }
        },
      });
    }
  }

  private setupProcessHandlersInternal(): void {
    if (!this.process) return;

    setupProcessHandlers({
      serverName: this._serverName,
      process: this.process,
      onError: (error) => {
        this.errorHandlers.forEach((handler) => handler(error));
      },
      onClose: () => {
        this.closeHandlers.forEach((handler) => handler());
      },
    });
  }

  public async send(message: JSONRPCMessage): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error('Transport not started');
    }
    this.process.stdin.write(JSON.stringify(message) + '\n');
  }

  public async close(): Promise<void> {
    if (this.process) {
      this.process.kill();
      this.process = undefined;
    }
  }

  public set onmessage(handler: (message: JSONRPCMessage) => void) {
    this.messageHandlers.push(handler);
  }

  public set onerror(handler: (error: Error) => void) {
    this.errorHandlers.push(handler);
  }

  public set onclose(handler: () => void) {
    this.closeHandlers.push(handler);
  }
}
