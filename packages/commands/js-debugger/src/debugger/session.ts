import path from 'node:path';
import Emittery from 'emittery';

import type {
  DebuggerCommand,
  DebuggerCommandResult,
  DebugSessionConfig,
  DebugSessionDescriptor,
  DebugSessionId,
  DebugSessionSnapshot,
  InspectorEndpoint,
  NodeDebugTargetConfig,
  OutputQuery,
  OutputQueryResult,
  ScriptMetadata,
  ScopeQuery,
  ScopeQueryResult,
  SessionState,
  StartDebugSessionResponse,
} from '../types/index.js';
import { OutputBuffer } from './output-buffer.js';
import type { SessionEvents } from './session-types.js';
import { buildConsoleEntry } from './session-mappers.js';
import { SessionBreakpointManager } from './session-breakpoint-manager.js';
import { SessionScopeInspector } from './session-scope-inspector.js';
import { SessionEventProcessor } from './session-event-processor.js';
import { SessionProcessManager } from './session-process-manager.js';
import {
  performInitialization,
  type InitializationContext,
} from './session-initialization.js';
import {
  executeDebuggerAction,
  buildCommandAcknowledgment,
  type CommandExecutionContext,
} from './session-command-handler.js';
import {
  waitForResumed,
  tryRunIfWaitingForDebugger,
  GRACEFUL_EXIT_DELAY_MS,
} from './session-utils.js';
export class DebuggerSession {
  public readonly id: DebugSessionId;

  private readonly config: DebugSessionConfig;
  private readonly descriptor: DebugSessionDescriptor;
  private status: SessionState = {
    status: 'starting',
  };
  private readonly outputBuffer = new OutputBuffer();
  private readonly events = new Emittery<SessionEvents>();
  private terminated = false;
  private readonly scriptUrls = new Map<string, string>();
  private readonly scripts = new Map<string, ScriptMetadata>();
  private readonly scriptIdsByPath = new Map<string, string>();
  private readonly scriptIdsByFileUrl = new Map<string, string>();
  private readonly targetWorkingDirectory: string;
  private readonly processManager: SessionProcessManager;
  private readonly breakpointManager: SessionBreakpointManager;
  private readonly scopeInspector: SessionScopeInspector;
  private readonly eventProcessor: SessionEventProcessor;
  private commandIntent: 'resume' | 'pause' | null = null;

  public constructor(id: DebugSessionId, config: DebugSessionConfig) {
    this.id = id;
    this.config = config;
    const nodeTarget = this.getNodeTargetConfig(config.target);
    this.targetWorkingDirectory = nodeTarget.cwd
      ? path.resolve(nodeTarget.cwd)
      : process.cwd();
    this.descriptor = this.createInitialDescriptor();

    this.processManager = new SessionProcessManager(
      this.id,
      this.outputBuffer,
      (method, params) => this.eventProcessor.handleEvent(method, params),
      (code, signal) => this.handleProcessExit(code, signal),
      (inspector) => this.handleInspectorRegistered(inspector),
    );

    this.breakpointManager = new SessionBreakpointManager(
      this.id,
      this.scripts,
      this.scriptIdsByPath,
      this.scriptIdsByFileUrl,
      this.targetWorkingDirectory,
      (method, params) => this.processManager.sendCommand(method, params),
    );

    this.scopeInspector = new SessionScopeInspector(
      (method, params) => this.processManager.sendCommand(method, params),
      (text) => {
        const entry = buildConsoleEntry(
          'info',
          'log-entry',
          [],
          Date.now(),
          undefined,
        );
        entry.text = text;
        this.outputBuffer.addConsole(entry);
      },
    );

    this.eventProcessor = new SessionEventProcessor(
      this.id,
      this.scripts,
      this.scriptUrls,
      this.scriptIdsByPath,
      this.scriptIdsByFileUrl,
      this.targetWorkingDirectory,
      this.outputBuffer,
      this.events,
      this.updateStatus.bind(this),
      this.breakpointManager,
    );

    // Set up event listeners to clear commandIntent when events arrive
    this.events.on('resumed', () => {
      if (this.commandIntent === 'resume') {
        this.commandIntent = null;
      }
    });

    this.events.on('paused', () => {
      if (this.commandIntent === 'pause') {
        this.commandIntent = null;
      } else if (this.commandIntent === 'resume') {
        this.commandIntent = null;
      }
    });
  }

  public getDescriptor(): DebugSessionDescriptor {
    return {
      ...this.descriptor,
      target: { ...this.descriptor.target },
      inspector: this.descriptor.inspector
        ? { ...this.descriptor.inspector }
        : undefined,
      state: this.buildSessionState(),
    };
  }

  private buildSessionState(): SessionState {
    // If we have a command intent, we're transitioning
    if (this.commandIntent) {
      const from =
        this.status.status === 'paused' || this.status.status === 'running'
          ? this.status.status
          : 'running'; // Default to running for other states
      return {
        status: 'transitioning',
        from,
        intent: this.commandIntent,
      };
    }

    // Otherwise, return the current status as-is
    return this.status;
  }

  public getSnapshot(): DebugSessionSnapshot {
    return {
      session: this.getDescriptor(),
      output: this.outputBuffer.snapshot(),
    };
  }

  public async initialize(): Promise<StartDebugSessionResponse> {
    const nodeTarget = this.getNodeTargetConfig(this.config.target);
    await this.processManager.spawnAndConnect(nodeTarget);
    this.updatePidInDescriptor();
    this.updateStatus({ status: 'awaiting-debugger' });

    // Listen for execution completion to disconnect debugger
    void this.events
      .once('execution-complete')
      .then(() => {
        this.processManager.closeConnection();
      })
      .catch((err) => {
        console.error(
          `Session ${this.id}: Error while disconnecting debugger after execution complete:`,
          err,
        );
      });

    // Perform the initialization sequence
    const context: InitializationContext = {
      sessionId: this.id,
      config: this.config,
      nodeTarget,
      events: this.events,
      processManager: this.processManager,
      breakpointManager: this.breakpointManager,
      outputBuffer: this.outputBuffer,
      getLastPause: () => this.eventProcessor.getLastPause(),
    };

    const { breakpoints, initialPause } = await performInitialization(context);

    if (this.config.resumeAfterConfigure) {
      await this.resumeExecution();
      return {
        session: this.getDescriptor(),
        breakpoints,
      };
    }

    return {
      session: this.getDescriptor(),
      breakpoints,
      initialPause,
    };
  }

  public async runCommand(
    command: DebuggerCommand,
  ): Promise<DebuggerCommandResult> {
    const mutationResult = await this.breakpointManager.applyBreakpointMutation(
      command.breakpoints,
    );

    const executionContext: CommandExecutionContext = {
      status: this.status,
      events: this.events,
      sendCommand: (method, params) =>
        this.processManager.sendCommand(method, params),
      eventProcessor: this.eventProcessor,
      breakpointManager: this.breakpointManager,
      setCommandIntent: (intent) => {
        this.commandIntent = intent;
      },
      getLastPause: () => this.eventProcessor.getLastPause(),
    };

    const { pauseDetails, resumed } = await executeDebuggerAction(
      command,
      executionContext,
    );

    const commandAck = buildCommandAcknowledgment(command);

    const response: DebuggerCommandResult = {
      session: this.getDescriptor(),
      commandAck,
    };
    if (mutationResult.set.length > 0) {
      response.setBreakpoints = mutationResult.set;
    }
    if (mutationResult.removed.length > 0) {
      response.removedBreakpoints = mutationResult.removed;
    }
    if (pauseDetails) {
      response.pause = pauseDetails;
    }
    if (resumed) {
      response.resumed = true;
    }
    return response;
  }

  public async queryOutput(query: OutputQuery): Promise<OutputQueryResult> {
    return this.outputBuffer.query(query);
  }

  public async getScopeVariables(query: ScopeQuery): Promise<ScopeQueryResult> {
    const lastPause = this.eventProcessor.getLastPause();
    if (!lastPause) {
      throw new Error(
        'Session is not paused. Pause execution before inspecting scopes.',
      );
    }
    const callFrame = lastPause.callFrames.find(
      (frame) => frame.callFrameId === query.callFrameId,
    );
    if (!callFrame) {
      throw new Error(`Call frame ${query.callFrameId} not found.`);
    }
    const scope = callFrame.scopeChain[query.scopeNumber];
    if (!scope) {
      throw new Error(`Scope index ${query.scopeNumber} out of range.`);
    }
    return this.scopeInspector.getScopeVariables(query, scope.object);
  }

  public onTerminated(handler: (value: SessionEvents['terminated']) => void) {
    return this.events.on('terminated', handler);
  }

  public terminate(): void {
    if (this.terminated) {
      return;
    }
    // Close the WebSocket connection, which should cause the Node.js process to exit
    this.processManager.closeConnection();
    // Give it a moment to exit gracefully
    setTimeout(() => {
      // If it hasn't exited after a brief delay, force termination
      if (!this.terminated) {
        this.handleProcessExit(null, 'SIGTERM');
      }
    }, GRACEFUL_EXIT_DELAY_MS);
  }

  private createInitialDescriptor(): DebugSessionDescriptor {
    const createdAt = Date.now();
    const nodeTarget = this.getNodeTargetConfig(this.config.target);
    const cwd = nodeTarget.cwd ? path.resolve(nodeTarget.cwd) : undefined;
    const entry = path.isAbsolute(nodeTarget.entry)
      ? nodeTarget.entry
      : path.resolve(cwd ?? process.cwd(), nodeTarget.entry);
    return {
      id: this.id,
      target: {
        type: 'node',
        entry,
        entryArguments: nodeTarget.entryArguments,
        cwd,
        useTsx: nodeTarget.useTsx,
        runtimeArguments: nodeTarget.runtimeArguments,
      },
      state: { status: 'starting' },
      createdAt,
      updatedAt: createdAt,
    };
  }

  private getNodeTargetConfig(
    target: DebugSessionConfig['target'],
  ): NodeDebugTargetConfig {
    if ((target as NodeDebugTargetConfig).type !== 'node') {
      throw new Error('Only Node.js targets are currently supported.');
    }
    return target as NodeDebugTargetConfig;
  }

  private handleInspectorRegistered(inspector: InspectorEndpoint): void {
    this.descriptor.inspector = inspector;
    this.descriptor.updatedAt = Date.now();
  }

  private updatePidInDescriptor(): void {
    const pid = this.processManager.getProcessId();
    if (pid) {
      this.descriptor.pid = pid;
      this.descriptor.updatedAt = Date.now();
    }
  }

  private async resumeExecution(): Promise<void> {
    await tryRunIfWaitingForDebugger((method, params) =>
      this.processManager.sendCommand(method, params),
    );
    if (this.status.status === 'paused') {
      await this.processManager.sendCommand('Debugger.resume');
      await waitForResumed(this.events, this.status, 'resume');
    }
  }

  private handleProcessExit(
    code: number | null,
    signal?: NodeJS.Signals,
  ): void {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    this.updateStatus({
      status: 'terminated',
      exitCode: code,
      signal: signal ?? null,
    });
    this.processManager.closeConnection();
    this.processManager.notifyTerminated();
    this.processManager.clearPendingCommands();
    this.processManager.handleTermination(this.scripts);
    this.scripts.clear();
    this.scriptIdsByPath.clear();
    this.scriptIdsByFileUrl.clear();
    void this.events.emit('terminated', { code, signal: signal ?? null });
  }

  private updateStatus(status: SessionState): void {
    this.status = status;
    this.descriptor.state = status;
    this.descriptor.updatedAt = Date.now();
  }
}
