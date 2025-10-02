import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import Emittery from 'emittery';

import type {
  BreakpointSummary,
  DebuggerCommand,
  DebuggerCommandResult,
  DebugSessionConfig,
  DebugSessionDescriptor,
  DebugSessionId,
  DebugSessionSnapshot,
  DebugSessionStatus,
  InspectorEndpoint,
  NodeDebugTargetConfig,
  OutputQuery,
  OutputQueryResult,
  PauseDetails,
  ScriptMetadata,
  ScopeQuery,
  ScopeQueryResult,
  StartDebugSessionResponse,
} from '../types/index.js';
import { OutputBuffer } from './output-buffer.js';
import type { SessionEvents } from './session-types.js';
import { buildConsoleEntry } from './session-mappers.js';
import { SessionBreakpointManager } from './session-breakpoint-manager.js';
import { SessionScopeInspector } from './session-scope-inspector.js';
import { SessionEventProcessor } from './session-event-processor.js';
import { SessionProcessManager } from './session-process-manager.js';

const COMMAND_TIMEOUT_MS = 10_000;

export class DebuggerSession {
  public readonly id: DebugSessionId;

  private readonly config: DebugSessionConfig;
  private descriptor: DebugSessionDescriptor;
  private status: DebugSessionStatus = 'starting';
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
      this.emitInstructions.bind(this),
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
  }

  public getDescriptor(): DebugSessionDescriptor {
    return {
      ...this.descriptor,
      target: { ...this.descriptor.target },
      inspector: this.descriptor.inspector
        ? { ...this.descriptor.inspector }
        : undefined,
    };
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
    this.updateStatus('awaiting-debugger');

    let initialPause: PauseDetails | undefined;
    try {
      initialPause = await this.waitForPause(
        'Initial pause after attach',
        true,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Session ${this.id}: did not receive initial pause (${message}).`,
      );
    }

    let createdBreakpoints: BreakpointSummary[] | undefined;
    if (this.config.breakpoints && this.config.breakpoints.length > 0) {
      const { set } = await this.breakpointManager.applyBreakpointMutation({
        set: this.config.breakpoints,
      });
      if (set.length > 0) {
        createdBreakpoints = set;
      }
    }

    if (this.config.resumeAfterConfigure) {
      await this.resumeExecution();
      this.emitInstructions(
        'Session ready. Execution resumed automatically. Use js-debugger_debuggerCommand for actions like "pause" or "stepOver". Line and column numbers follow CDP zero-based coordinates.',
      );
      return {
        session: this.getDescriptor(),
        breakpoints: createdBreakpoints,
      };
    }

    this.emitInstructions(
      'Session ready. Use js-debugger_debuggerCommand with actions like "continue", "pause", or "stepOver". Include breakpoints.set/remove to adjust breakpoints. Line and column numbers follow CDP zero-based coordinates.',
    );
    return {
      session: this.getDescriptor(),
      breakpoints: createdBreakpoints,
      initialPause,
    };
  }

  public async runCommand(
    command: DebuggerCommand,
  ): Promise<DebuggerCommandResult> {
    const mutationResult = await this.breakpointManager.applyBreakpointMutation(
      command.breakpoints,
    );
    let pauseDetails: PauseDetails | undefined;
    let resumed = false;
    switch (command.action) {
      case 'continue':
        await this.tryRunIfWaitingForDebugger();
        if (this.status === 'paused') {
          await this.processManager.sendCommand('Debugger.resume');
          await this.waitForResumed('resume');
        }
        this.updateStatus('running');
        resumed = true;
        break;
      case 'pause':
        if (this.status === 'paused' && this.eventProcessor.getLastPause()) {
          pauseDetails = this.eventProcessor.getLastPause();
        } else {
          await this.processManager.sendCommand('Debugger.pause');
          pauseDetails = await this.waitForPause('pause');
        }
        break;
      case 'stepInto':
        await this.processManager.sendCommand('Debugger.stepInto');
        pauseDetails = await this.waitForPause('stepInto');
        break;
      case 'stepOver':
        await this.processManager.sendCommand('Debugger.stepOver');
        pauseDetails = await this.waitForPause('stepOver');
        break;
      case 'stepOut':
        await this.processManager.sendCommand('Debugger.stepOut');
        pauseDetails = await this.waitForPause('stepOut');
        break;
      case 'continueToLocation':
        await this.processManager.sendCommand('Debugger.continueToLocation', {
          location: this.breakpointManager.toCdpLocation(command.location),
        });
        pauseDetails = await this.waitForPause('continueToLocation');
        break;
      default:
        throw new Error(
          `Unsupported action: ${(command as { action: string }).action}`,
        );
    }

    const response: DebuggerCommandResult = {
      session: this.getDescriptor(),
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
      status: this.status,
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
    await this.tryRunIfWaitingForDebugger();
    if (this.status === 'paused') {
      await this.processManager.sendCommand('Debugger.resume');
      await this.waitForResumed('resume');
    }
  }
  private async tryRunIfWaitingForDebugger(): Promise<void> {
    try {
      await this.processManager.sendCommand('Runtime.runIfWaitingForDebugger');
    } catch (error) {
      if (
        error instanceof Error &&
        !/not waiting|cannot be run|No process is waiting/i.test(error.message)
      ) {
        throw error;
      }
    }
  }

  private async waitForPause(
    reason: string,
    useExisting = false,
  ): Promise<PauseDetails> {
    const lastPause = this.eventProcessor.getLastPause();
    if (useExisting && lastPause) {
      return lastPause;
    }
    return this.withTimeout(
      this.events.once('paused'),
      COMMAND_TIMEOUT_MS,
      `Timed out waiting for pause (${reason})`,
    );
  }

  private async waitForResumed(reason: string): Promise<void> {
    if (this.status === 'running' || this.status === 'awaiting-debugger') {
      return;
    }
    await this.withTimeout(
      this.events.once('resumed'),
      COMMAND_TIMEOUT_MS,
      `Timed out waiting for resume (${reason})`,
    );
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

  private emitInstructions(text: string): void {
    const entry = buildConsoleEntry(
      'info',
      'log-entry',
      [],
      Date.now(),
      undefined,
    );
    entry.text = text;
    this.outputBuffer.addConsole(entry);
  }

  private handleProcessExit(
    code: number | null,
    signal?: NodeJS.Signals,
  ): void {
    if (this.terminated) {
      return;
    }
    this.terminated = true;
    this.updateStatus('terminated');
    this.processManager.closeConnection();
    this.processManager.notifyTerminated();
    this.processManager.clearPendingCommands();
    this.processManager.handleTermination(this.scripts);
    this.scripts.clear();
    this.scriptIdsByPath.clear();
    this.scriptIdsByFileUrl.clear();
    void this.events.emit('terminated', { code, signal: signal ?? null });
  }

  private updateStatus(status: DebugSessionStatus): void {
    this.status = status;
    this.descriptor.status = status;
    this.descriptor.updatedAt = Date.now();
  }
}
