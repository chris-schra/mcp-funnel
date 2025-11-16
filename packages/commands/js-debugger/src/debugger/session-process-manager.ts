import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { execa } from 'execa';
import WebSocket from 'ws';
import type {
  DebugSessionId,
  InspectorEndpoint,
  NodeDebugTargetConfig,
  ScriptMetadata,
  StdioEntry,
  StreamName,
} from '../types/index.js';
import type { CdpMessage, PendingCommand } from './session-types.js';
import { OutputBuffer } from './output-buffer.js';
import { buildConsoleEntry } from './session-mappers.js';
import { findTsconfigDir } from '../util/tsconfig-finder.js';

const INSPECTOR_URL_REGEX = /Debugger listening on (ws:\/\/[\w.:\-/]+)/;
const STDIO_ENCODING: BufferEncoding = 'utf8';
const COMMAND_TIMEOUT_MS = 3_000;

/**
 * Manages process lifecycle and CDP communication for a debugger session.
 */
export class SessionProcessManager {
  private child?: ReturnType<typeof execa>;
  private ws?: WebSocket;
  private messageId = 0;
  private readonly pendingCommands = new Map<number, PendingCommand>();
  private readonly inspectorPromise: Promise<string>;
  private inspectorResolver?: (url: string) => void;
  private inspectorRejecter?: (error: Error) => void;
  private inspector?: InspectorEndpoint;
  private stdioOffsets: Record<StreamName, number> = {
    stdout: 0,
    stderr: 0,
  };
  private stdioRemainder: Record<StreamName, string> = {
    stdout: '',
    stderr: '',
  };
  private terminated = false;

  public constructor(
    private readonly sessionId: DebugSessionId,
    private readonly outputBuffer: OutputBuffer,
    private readonly onMessage: (method: string, params: unknown) => void,
    private readonly onProcessExit: (code: number | null, signal?: NodeJS.Signals) => void,
    private readonly onInspectorRegistered: (inspector: InspectorEndpoint) => void,
  ) {
    this.inspectorPromise = new Promise<string>((resolve, reject) => {
      this.inspectorResolver = resolve;
      this.inspectorRejecter = reject;
    });
  }

  public async spawnAndConnect(target: NodeDebugTargetConfig): Promise<void> {
    await this.spawnTargetProcess(target);
    const inspectorUrl = await this.withTimeout(
      this.inspectorPromise,
      COMMAND_TIMEOUT_MS,
      'Timed out waiting for inspector URL from target process',
    );
    await this.connectToInspector(inspectorUrl);
  }

  public async sendCommand<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Inspector connection is not open.');
    }
    if (this.terminated) {
      throw new Error('Session already terminated.');
    }
    const id = ++this.messageId;
    const payload = JSON.stringify({ id, method, params });

    return new Promise<T>((resolve, reject) => {
      this.pendingCommands.set(id, { resolve, reject });
      this.ws!.send(payload, (error) => {
        if (error) {
          console.error(`CDP Send Error for ${method}: ${error}`);
          this.pendingCommands.delete(id);
          reject(error);
        }
      });
    });
  }

  public async trySendCommand(method: string, params?: Record<string, unknown>): Promise<void> {
    try {
      await this.sendCommand(method, params);
    } catch (error) {
      if (
        error instanceof Error &&
        /wasn't found|not found|unrecognized|Unhandled method/i.test(error.message)
      ) {
        console.warn(`CDP command ${method} not available: ${error.message}`);
        return;
      }
      throw error;
    }
  }

  public getInspector(): InspectorEndpoint | undefined {
    return this.inspector;
  }

  public getProcessId(): number | undefined {
    return this.child?.pid;
  }

  public closeConnection(): void {
    this.ws?.close();
  }

  public clearPendingCommands(): void {
    for (const pending of this.pendingCommands.values()) {
      pending.reject(new Error('Session terminated before command completed.'));
    }
    this.pendingCommands.clear();
  }

  public notifyTerminated(): void {
    this.terminated = true;
  }

  public isProcessRunning(): boolean {
    return !!this.child && !this.child.killed;
  }

  public forceKillProcess(): void {
    if (this.child && !this.child.killed) {
      try {
        this.child.kill('SIGKILL');
      } catch (error) {
        console.warn(`Session ${this.sessionId}: Failed to force kill process: ${error}`);
      }
    }
  }

  private async spawnTargetProcess(target: NodeDebugTargetConfig): Promise<void> {
    // For TypeScript files, auto-discover project context by finding closest tsconfig.json
    let cwd: string;
    if (target.cwd) {
      cwd = path.resolve(target.cwd);
    } else if (target.useTsx) {
      const entryAbsolute = path.isAbsolute(target.entry)
        ? target.entry
        : path.resolve(process.cwd(), target.entry);
      const entryDir = path.dirname(entryAbsolute);
      const tsconfigDir = await findTsconfigDir(entryDir);
      cwd = tsconfigDir ?? process.cwd();
      if (tsconfigDir) {
        console.info(`Session ${this.sessionId}: Auto-discovered cwd from tsconfig: ${cwd}`);
      }
    } else {
      cwd = process.cwd();
    }

    const entry = path.isAbsolute(target.entry) ? target.entry : path.resolve(cwd, target.entry);
    const nodeExecutable = target.nodePath ?? process.execPath;
    const inspectHost = target.inspectHost ?? '127.0.0.1';
    const inspectSpecifier = `${inspectHost}:0`;

    const args: string[] = [`--inspect-brk=${inspectSpecifier}`];
    if (target.runtimeArguments) {
      args.push(...target.runtimeArguments);
    }
    if (target.useTsx) {
      args.push('--import', 'tsx');
    }
    args.push(entry);
    if (target.entryArguments) {
      args.push(...target.entryArguments);
    }

    const env = { ...process.env, ...(target.env ?? {}) };

    const child = execa(nodeExecutable, args, {
      cwd,
      env,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    });
    this.child = child;
    child.catch((err) =>
      console.error(`Session ${this.sessionId}: Process failed: ${err.message}`),
    );
    child.on('exit', (code, signal) => {
      this.onProcessExit(code, signal ?? undefined);
    });

    child.on('disconnect', () => {
      console.info(`Session ${this.sessionId}: Child process disconnected`);
    });

    if (child.stdout) {
      child.stdout.on('data', (chunk: Buffer) => this.handleStdStream('stdout', chunk));
    }
    if (child.stderr) {
      child.stderr.on('data', (chunk: Buffer) => this.handleStdStream('stderr', chunk));
    }
  }

  private async connectToInspector(url: string): Promise<void> {
    console.info(`Connecting to inspector at: ${url}`);
    const ws = await new Promise<WebSocket>((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.once('open', () => resolve(socket));
      socket.once('error', (error) => reject(error));
    });

    this.ws = ws;
    ws.on('message', (data) => this.handleSocketMessage(data));
    ws.on('error', (error) => this.handleSocketError(error));
    ws.on('close', () => this.handleSocketClose());

    await this.sendCommand('Runtime.enable', {});
    await this.sendCommand('Debugger.enable', {});
    await this.sendCommand('Debugger.setBreakpointsActive', { active: true });
    await this.trySendCommand('Debugger.setAsyncCallStackDepth', {
      maxDepth: 32,
    });
  }

  private handleStdStream(stream: StreamName, chunk: Buffer): void {
    const text = chunk.toString(STDIO_ENCODING);
    const timestamp = Date.now();
    const entry: StdioEntry = {
      stream,
      text,
      timestamp,
      offset: this.stdioOffsets[stream],
    };
    this.stdioOffsets[stream] += chunk.length;
    this.outputBuffer.addStdio(entry);
    this.processInspectorOutput(stream, text);
  }

  private processInspectorOutput(stream: StreamName, text: string): void {
    const combined = this.stdioRemainder[stream] + text;
    const lines = combined.split(/\r?\n/);
    this.stdioRemainder[stream] = lines.pop() ?? '';
    for (const line of lines) {
      const match = INSPECTOR_URL_REGEX.exec(line.trim());
      if (match) {
        this.registerInspectorUrl(match[1]);
      }
    }
  }

  private registerInspectorUrl(url: string): void {
    if (this.inspector) {
      return;
    }
    const parsed = new URL(url);
    this.inspector = {
      host: parsed.hostname,
      port: Number(parsed.port),
      url,
    };
    this.onInspectorRegistered(this.inspector);
    this.inspectorResolver?.(url);
    this.inspectorResolver = undefined;
    this.inspectorRejecter = undefined;
  }

  private handleSocketMessage(data: WebSocket.RawData): void {
    try {
      const message = JSON.parse(data.toString()) as CdpMessage;

      if (typeof message.id === 'number') {
        const pending = this.pendingCommands.get(message.id);
        if (pending) {
          this.pendingCommands.delete(message.id);
          if (message.error) {
            console.error(
              `CDP Error Response for id ${message.id}: ${JSON.stringify(message.error)}`,
            );
            pending.reject(new Error(message.error.message ?? 'Unknown CDP error'));
          } else {
            pending.resolve(message.result);
          }
        }
        return;
      }
      if (message.method) {
        this.onMessage(message.method, message.params);
      }
    } catch (error) {
      const entry = buildConsoleEntry('error', 'log-entry', [], Date.now(), undefined);
      this.outputBuffer.addConsole({
        ...entry,
        text: `Failed to process CDP message: ${String(error)}`,
      });
    }
  }

  private handleSocketError(error: unknown): void {
    if (!this.terminated) {
      const text = `WebSocket error: ${error instanceof Error ? error.message : String(error)}`;
      const entry = buildConsoleEntry('error', 'log-entry', [], Date.now(), undefined);
      this.outputBuffer.addConsole({ ...entry, text });
    }
  }

  private handleSocketClose(): void {
    console.info(
      `Session ${this.sessionId}: WebSocket closed, process still running: ${this.child && !this.child.killed}`,
    );
    this.ws = undefined;
    // Log if the process is still alive after WebSocket closes
    if (this.child && !this.child.killed) {
      console.info(
        `Session ${this.sessionId}: Process PID ${this.child.pid} is still running after WebSocket close`,
      );
    }
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    message: string,
  ): Promise<T> {
    const timeout = (async () => {
      await delay(timeoutMs);
      throw new Error(message);
    })();
    return Promise.race([promise, timeout]) as Promise<T>;
  }

  public handleTermination(scripts: Map<string, ScriptMetadata>): void {
    if (this.inspectorRejecter) {
      this.inspectorRejecter(new Error('Process exited before inspector was available.'));
      this.inspectorResolver = undefined;
      this.inspectorRejecter = undefined;
    }
    for (const metadata of scripts.values()) {
      try {
        metadata.sourceMap?.consumer.destroy();
      } catch {
        // ignore cleanup failures
      }
    }
  }
}
