import {
  type Transport,
  type TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import { type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { spawn, type ChildProcess } from 'child_process';
import * as readline from 'readline';
import { TransportError } from '../errors/transport-error.js';
import { logEvent, logError } from '../../logger.js';

/**
 * Configuration options for StdioClientTransport
 */
export interface StdioTransportOptions {
  /** Command to execute */
  command: string;
  /** Command arguments */
  args?: string[];
  /** Environment variables to pass to the child process */
  env?: Record<string, string>;
  /** Working directory for the child process */
  cwd?: string;
  /** Timeout for process spawn in milliseconds */
  spawnTimeout?: number;
}

/**
 * StdioClientTransport implements the MCP SDK Transport interface for stdio-based communication.
 * This transport spawns a child process and communicates over stdin/stdout using JSON-RPC messages.
 *
 * Key features:
 * - Implements MCP SDK Transport interface fully
 * - Handles process lifecycle (spawn, cleanup, error handling)
 * - Supports structured logging and error reporting
 * - Extracts reusable stdio logic for future transports
 */
export class StdioClientTransport implements Transport {
  private process?: ChildProcess;
  private readonly options: Required<
    Pick<StdioTransportOptions, 'command' | 'args' | 'env' | 'cwd'>
  > &
    Pick<StdioTransportOptions, 'spawnTimeout'>;
  private readonly serverName: string;
  private isStarted = false;
  private isClosed = false;

  // Transport interface callbacks
  public onclose?: () => void;
  public onerror?: (error: Error) => void;
  public onmessage?: (message: JSONRPCMessage) => void;
  public sessionId?: string;

  constructor(serverName: string, options: StdioTransportOptions) {
    this.serverName = serverName;
    this.options = {
      command: options.command,
      args: options.args || [],
      env: { ...process.env, ...options.env } as Record<string, string>,
      cwd: options.cwd || process.cwd(),
      spawnTimeout: options.spawnTimeout,
    };

    // Generate a session ID for this transport instance
    this.sessionId = `stdio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Starts the transport by spawning the child process and setting up communication.
   * This method should only be called after callbacks are installed.
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      throw TransportError.protocolError('Transport already started');
    }

    if (this.isClosed) {
      throw TransportError.protocolError('Cannot start a closed transport');
    }

    try {
      await this.spawnProcess();
      this.setupProcessHandlers();
      this.isStarted = true;

      logEvent('info', 'transport:stdio:connected', {
        server: this.serverName,
        sessionId: this.sessionId,
        command: this.options.command,
        args: this.options.args,
      });
    } catch (error) {
      const transportError = this.handleSpawnError(error);
      this.cleanup();
      throw transportError;
    }
  }

  /**
   * Sends a JSON-RPC message to the child process via stdin.
   */
  async send(
    message: JSONRPCMessage,
    options?: TransportSendOptions,
  ): Promise<void> {
    if (!this.isStarted || !this.process?.stdin) {
      throw TransportError.protocolError(
        'Transport not started or stdin unavailable',
      );
    }

    if (this.isClosed) {
      throw TransportError.protocolError('Cannot send on closed transport');
    }

    try {
      const serialized = JSON.stringify(message);
      this.process.stdin.write(serialized + '\n');

      logEvent('debug', 'transport:stdio:message_sent', {
        server: this.serverName,
        sessionId: this.sessionId,
        messageId: 'id' in message ? message.id : undefined,
        method: 'method' in message ? message.method : undefined,
        relatedRequestId: options?.relatedRequestId,
      });
    } catch (error) {
      const transportError = TransportError.protocolError(
        `Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error : undefined,
      );

      logError('transport:stdio:send_failed', transportError, {
        server: this.serverName,
        sessionId: this.sessionId,
        message: 'id' in message ? { id: message.id } : undefined,
      });

      throw transportError;
    }
  }

  /**
   * Closes the transport and cleans up the child process.
   */
  async close(): Promise<void> {
    if (this.isClosed) {
      return;
    }

    this.isClosed = true;
    this.cleanup();

    logEvent('info', 'transport:stdio:closed', {
      server: this.serverName,
      sessionId: this.sessionId,
    });

    // Invoke onclose callback if set
    if (this.onclose) {
      try {
        this.onclose();
      } catch (error) {
        logError('transport:stdio:onclose_error', error, {
          server: this.serverName,
          sessionId: this.sessionId,
        });
      }
    }
  }

  /**
   * Sets the protocol version used for the connection.
   * Called when the initialize response is received.
   */
  setProtocolVersion?(version: string): void {
    logEvent('debug', 'transport:stdio:protocol_version_set', {
      server: this.serverName,
      sessionId: this.sessionId,
      version,
    });
  }

  /**
   * Spawns the child process with the configured options.
   */
  private async spawnProcess(): Promise<void> {
    return new Promise((resolve, reject) => {
      const spawnTimeout = this.options.spawnTimeout;
      let timeoutId: NodeJS.Timeout | undefined;

      if (spawnTimeout && spawnTimeout > 0) {
        timeoutId = setTimeout(() => {
          reject(TransportError.connectionTimeout(spawnTimeout));
        }, spawnTimeout);
      }

      try {
        this.process = spawn(this.options.command, this.options.args, {
          env: this.options.env,
          cwd: this.options.cwd,
          stdio: ['pipe', 'pipe', 'pipe'], // Full control over all streams
        });

        // Clear timeout on successful spawn
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        // Handle immediate spawn errors
        this.process.on('error', (error) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          reject(this.handleSpawnError(error));
        });

        // Process spawned successfully
        resolve();
      } catch (error) {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        reject(this.handleSpawnError(error));
      }
    });
  }

  /**
   * Sets up event handlers for the spawned process.
   */
  private setupProcessHandlers(): void {
    if (!this.process) {
      throw TransportError.protocolError(
        'Process not available for handler setup',
      );
    }

    // Handle stdout for JSON-RPC messages
    if (this.process.stdout) {
      const stdoutReader = readline.createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
      });

      stdoutReader.on('line', (line: string) => {
        this.handleStdoutLine(line);
      });
    }

    // Handle stderr for error/debug output
    if (this.process.stderr) {
      const stderrReader = readline.createInterface({
        input: this.process.stderr,
        crlfDelay: Infinity,
      });

      stderrReader.on('line', (line: string) => {
        this.handleStderrLine(line);
      });
    }

    // Handle process-level events
    this.process.on('error', (error) => {
      this.handleProcessError(error);
    });

    this.process.on('close', (code, signal) => {
      this.handleProcessClose(code, signal);
    });

    this.process.on('exit', (code, signal) => {
      this.handleProcessExit(code, signal);
    });
  }

  /**
   * Handles a line of output from the process stdout.
   * Expected to contain JSON-RPC messages.
   */
  private handleStdoutLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    try {
      const message = JSON.parse(line) as JSONRPCMessage;

      logEvent('debug', 'transport:stdio:message_received', {
        server: this.serverName,
        sessionId: this.sessionId,
        messageId: 'id' in message ? message.id : undefined,
        method: 'method' in message ? message.method : undefined,
      });

      if (this.onmessage) {
        this.onmessage(message);
      }
    } catch {
      // Not a JSON message, treat as stderr-like output
      logEvent('debug', 'transport:stdio:nonjson_stdout', {
        server: this.serverName,
        sessionId: this.sessionId,
        line: line.slice(0, 200), // Truncate for logging
      });

      // Log to stderr stream since it's non-protocol output
      console.error(`[${this.serverName}] ${line}`);
    }
  }

  /**
   * Handles a line of output from the process stderr.
   * Used for debugging and error information.
   */
  private handleStderrLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    // Log stderr with server prefix
    console.error(`[${this.serverName}] ${line}`);

    logEvent('debug', 'transport:stdio:stderr', {
      server: this.serverName,
      sessionId: this.sessionId,
      line: line.slice(0, 200), // Truncate for logging
    });
  }

  /**
   * Handles process-level errors.
   */
  private handleProcessError(error: Error): void {
    const transportError = this.handleSpawnError(error);

    logError('transport:stdio:process_error', transportError, {
      server: this.serverName,
      sessionId: this.sessionId,
    });

    if (this.onerror) {
      this.onerror(transportError);
    }
  }

  /**
   * Handles process close events.
   */
  private handleProcessClose(
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    logEvent('info', 'transport:stdio:process_closed', {
      server: this.serverName,
      sessionId: this.sessionId,
      code,
      signal,
    });

    if (code !== 0 && code !== null) {
      const error = TransportError.connectionReset(
        new Error(
          `Process exited with code ${code}${signal ? `, signal ${signal}` : ''}`,
        ),
      );

      logError('transport:stdio:process_exit_error', error, {
        server: this.serverName,
        sessionId: this.sessionId,
        code,
        signal,
      });

      if (this.onerror) {
        this.onerror(error);
      }
    }

    // Always trigger close when process closes
    if (!this.isClosed) {
      this.close();
    }
  }

  /**
   * Handles process exit events.
   */
  private handleProcessExit(
    code: number | null,
    signal: NodeJS.Signals | null,
  ): void {
    logEvent('debug', 'transport:stdio:process_exited', {
      server: this.serverName,
      sessionId: this.sessionId,
      code,
      signal,
    });
  }

  /**
   * Converts spawn/process errors to appropriate TransportErrors.
   */
  private handleSpawnError(error: unknown): TransportError {
    const err = error as { code?: string; message?: string; syscall?: string };

    // Map common spawn errors to transport error types
    switch (err.code) {
      case 'ENOENT':
        return TransportError.connectionFailed(
          `Command not found: ${this.options.command}`,
          error instanceof Error ? error : undefined,
        );
      case 'EACCES':
        return TransportError.connectionFailed(
          `Permission denied executing: ${this.options.command}`,
          error instanceof Error ? error : undefined,
        );
      case 'ENOTDIR':
        return TransportError.connectionFailed(
          `Invalid path: ${this.options.command}`,
          error instanceof Error ? error : undefined,
        );
      case 'EMFILE':
      case 'ENFILE':
        return TransportError.serviceUnavailable(
          error instanceof Error ? error : undefined,
        );
      case 'ETIMEDOUT':
        return TransportError.connectionTimeout(
          this.options.spawnTimeout || 30000,
          error instanceof Error ? error : undefined,
        );
      default:
        return TransportError.connectionFailed(
          err.message || String(error),
          error instanceof Error ? error : undefined,
        );
    }
  }

  /**
   * Cleans up process and resources.
   */
  private cleanup(): void {
    if (this.process) {
      try {
        // Try graceful termination first
        this.process.kill('SIGTERM');

        // Force kill after a brief delay if still running
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            this.process.kill('SIGKILL');
          }
        }, 1000);
      } catch (cleanupError) {
        // Process might already be dead, that's okay
        logEvent('debug', 'transport:stdio:cleanup_error', {
          server: this.serverName,
          sessionId: this.sessionId,
          error:
            cleanupError instanceof Error
              ? cleanupError.message
              : String(cleanupError),
        });
      }

      this.process = undefined;
    }
  }
}
