import {
  type Transport,
  type TransportSendOptions,
} from '@modelcontextprotocol/sdk/shared/transport.js';
import { type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { type ChildProcess } from 'child_process';
import * as readline from 'readline';
import { TransportError } from '../errors/transport-error.js';
import { logError, logEvent } from '../../logger.js';
import { handleSpawnError } from './utils/spawn-error-handler.js';
import { handleStdoutLine, handleStderrLine } from './utils/stdio-line-handlers.js';
import { spawnProcessWithTimeout, cleanupProcess } from './utils/process-spawn.js';

/**
 * Configuration options for StdioClientTransport.
 * @public
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
 * StdioClientTransport implements MCP SDK Transport for stdio-based communication.
 *
 * Spawns a child process and communicates over stdin/stdout using newline-delimited JSON-RPC.
 *
 * Key features:
 * - Child process lifecycle management (spawn, cleanup, error handling)
 * - Newline-delimited JSON-RPC message framing
 * - Structured logging and error reporting
 * - Process stderr forwarding for debugging
 * @public
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

  public constructor(serverName: string, options: StdioTransportOptions) {
    this.serverName = serverName;
    this.options = {
      command: options.command,
      args: options.args || [],
      env: { ...process.env, ...options.env } as Record<string, string>,
      cwd: options.cwd || process.cwd(),
      spawnTimeout: options.spawnTimeout,
    };

    // NOTE: sessionId must NOT be set in constructor!
    // The MCP SDK checks if sessionId is already set in client.connect() and skips
    // initialization if it is. Setting it here would cause "Received request before
    // initialization was complete" errors.
    // See: https://github.com/modelcontextprotocol/typescript-sdk/blob/main/src/client/index.ts
    // The sessionId will be set later via setProtocolVersion() after successful init.
  }

  /**
   * Starts the transport by spawning the child process and setting up communication.
   *
   * Should only be called after callbacks (onmessage, onerror, onclose) are installed.
   * @throws \{TransportError\} When process spawn fails or times out
   * @public
   */
  public async start(): Promise<void> {
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
      const transportError = handleSpawnError(
        error,
        this.options.command,
        this.options.spawnTimeout,
      );
      this.cleanup();
      throw transportError;
    }
  }

  /**
   * Sends a JSON-RPC message to the child process via stdin.
   *
   * Messages are serialized as JSON and terminated with newline.
   * @param message - JSON-RPC message to send
   * @param options - Optional send options (e.g., relatedRequestId)
   * @throws \{TransportError\} When transport not started or send fails
   * @public
   */
  public async send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    if (!this.isStarted || !this.process?.stdin) {
      throw TransportError.protocolError('Transport not started or stdin unavailable');
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
  public async close(): Promise<void> {
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
   * This is also where we set the sessionId, AFTER successful initialization.
   * @param version - Protocol version string
   */
  public setProtocolVersion?(version: string): void {
    // Generate sessionId here, after successful initialization
    if (!this.sessionId) {
      this.sessionId = `stdio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

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
    this.process = await spawnProcessWithTimeout({
      command: this.options.command,
      args: this.options.args,
      env: this.options.env,
      cwd: this.options.cwd,
      spawnTimeout: this.options.spawnTimeout,
    });
  }

  /**
   * Sets up event handlers for the spawned process.
   */
  private setupProcessHandlers(): void {
    if (!this.process) {
      throw TransportError.protocolError('Process not available for handler setup');
    }

    // Handle stdout for JSON-RPC messages
    if (this.process.stdout) {
      const stdoutReader = readline.createInterface({
        input: this.process.stdout,
        crlfDelay: Infinity,
      });

      stdoutReader.on('line', (line: string) => {
        handleStdoutLine(line, this.serverName, this.sessionId, this.onmessage);
      });
    }

    // Handle stderr for error/debug output
    if (this.process.stderr) {
      const stderrReader = readline.createInterface({
        input: this.process.stderr,
        crlfDelay: Infinity,
      });

      stderrReader.on('line', (line: string) => {
        handleStderrLine(line, this.serverName, this.sessionId);
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
   * Handles process-level errors.
   * @param error - Error from child process
   */
  private handleProcessError(error: Error): void {
    const transportError = handleSpawnError(error, this.options.command, this.options.spawnTimeout);

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
   * @param code - Exit code from child process
   * @param signal - Signal that terminated the process
   */
  private handleProcessClose(code: number | null, signal: NodeJS.Signals | null): void {
    logEvent('info', 'transport:stdio:process_closed', {
      server: this.serverName,
      sessionId: this.sessionId,
      code,
      signal,
    });

    if (code !== 0 && code !== null) {
      const error = TransportError.connectionReset(
        new Error(`Process exited with code ${code}${signal ? `, signal ${signal}` : ''}`),
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
   * @param code - Exit code from child process
   * @param signal - Signal that terminated the process
   */
  private handleProcessExit(code: number | null, signal: NodeJS.Signals | null): void {
    logEvent('debug', 'transport:stdio:process_exited', {
      server: this.serverName,
      sessionId: this.sessionId,
      code,
      signal,
    });
  }

  /**
   * Cleans up process and resources.
   */
  private cleanup(): void {
    cleanupProcess(this.process, this.serverName, this.sessionId);
    this.process = undefined;
  }
}
