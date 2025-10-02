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

    // Listen for execution completion to disconnect debugger
    // Runtime.executionContextDestroyed fires after all timers complete but before process.exit()
    // Disconnecting allows the Node.js process to exit naturally
    void this.events.once('execution-complete').then(() => {
      console.log(`Session ${this.id}: Execution complete, disconnecting debugger to allow process exit`);
      this.processManager.closeConnection();
    });

    // Set internal breakpoints at line 0, column 0 for all target files to ensure source maps are loaded
    const targetFiles = new Set<string>();
    if (this.config.breakpoints && this.config.breakpoints.length > 0) {
      for (const bp of this.config.breakpoints) {
        if (bp.location.url) {
          targetFiles.add(bp.location.url);
        }
      }
    }

    // Always set a line 0 breakpoint for the main entry file to ensure script parsing
    // Use the original path, not the temp path, because that's what Node.js actually executes
    targetFiles.add(nodeTarget.entry);

    const internalBreakpoints: string[] = [];
    for (const file of targetFiles) {
      try {
        // Try multiple approaches for internal breakpoints
        let result;

        // 1. Try the specific file path regex (from your WebSocket log)
        const escapedPath = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const urlRegex = `${escapedPath}|file://${escapedPath}`;

        try {
          result = await this.processManager.sendCommand(
            'Debugger.setBreakpointByUrl',
            {
              lineNumber: 0,
              columnNumber: 0,
              urlRegex,
              condition: '',
            },
          );
          console.log(`Session ${this.id}: Set specific file regex internal breakpoint`);
        } catch (error) {
          // 2. If that fails, try a general breakpoint at line 0 of any script
          console.log(`Session ${this.id}: Specific regex failed, trying general line 0 breakpoint`);
          result = await this.processManager.sendCommand(
            'Debugger.setBreakpointByUrl',
            {
              lineNumber: 0,
              columnNumber: 0,
              url: '', // Empty URL to match any script
              condition: '',
            },
          );
        }
        const breakpointResult = result as {
          breakpointId: string;
          locations?: Array<{
            scriptId: string;
            lineNumber: number;
            columnNumber: number;
          }>;
        };
        console.log(
          `Session ${this.id}: Internal breakpoint set result - ID: ${breakpointResult.breakpointId}, locations: ${JSON.stringify(breakpointResult.locations || [])}`,
        );
        internalBreakpoints.push(breakpointResult.breakpointId);
      } catch (error) {
        console.warn(
          `Session ${this.id}: Failed to set internal breakpoint for ${file}:`,
          error,
        );
      }
    }

    // Follow your exact WebSocket sequence
    // 1. Runtime.enable (already done in connectToInspector)
    // 2. Debugger.enable (already done in connectToInspector)
    // 3. Internal breakpoints already set above
    // 4. Debugger.pause
    await this.processManager.sendCommand('Debugger.pause');
    // 5. Runtime.runIfWaitingForDebugger
    await this.tryRunIfWaitingForDebugger();

    // Wait for the initial --inspect-brk pause, then resume to trigger internal breakpoints
    console.log(`Session ${this.id}: Waiting for initial --inspect-brk pause...`);
    let initialPause: PauseDetails | undefined;
    try {
      initialPause = await this.waitForPause(
        'Initial --inspect-brk pause',
        false,
      );
      console.log(`Session ${this.id}: Received initial --inspect-brk pause, resuming to trigger internal breakpoints`);

      // Resume to let the script execute and hit our internal line 0 breakpoints
      await this.processManager.sendCommand('Debugger.resume');
      console.log(`Session ${this.id}: Resumed execution, waiting for internal line 0 breakpoint hit...`);

      // Now wait for the internal line 0 breakpoint to be hit (with hitBreakpoints)
      initialPause = await this.waitForPause(
        'Internal line 0 breakpoint hit',
        false,
      );
      console.log(`Session ${this.id}: Internal line 0 breakpoint hit with hitBreakpoints`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Session ${this.id}: did not receive initial pause (${message}).`,
      );
    }

    // Now set the actual user-requested breakpoints while paused
    let createdBreakpoints: BreakpointSummary[] | undefined;
    if (this.config.breakpoints && this.config.breakpoints.length > 0) {
      console.log(
        `Session ${this.id}: Setting ${this.config.breakpoints.length} user breakpoints`,
      );
      for (const bp of this.config.breakpoints) {
        console.log(
          `Session ${this.id}: User breakpoint - url: ${bp.location.url}, line: ${bp.location.lineNumber}, column: ${bp.location.columnNumber}`,
        );
      }

      const { set } = await this.breakpointManager.applyBreakpointMutation({
        set: this.config.breakpoints,
      });
      if (set.length > 0) {
        createdBreakpoints = set;
        console.log(`Session ${this.id}: Created ${set.length} breakpoints:`);
        for (const bp of set) {
          console.log(
            `Session ${this.id}: Created breakpoint - ID: ${bp.id}, requested: ${JSON.stringify(bp.requested.location)}, resolved: ${JSON.stringify(bp.resolvedLocations)}`,
          );
        }
      }
    }

    // Clear internal breakpoints AFTER setting user breakpoints
    // This ensures we maintain the pause state and proper breakpoint mapping
    const clearInternalBreakpoints = async () => {
      for (const breakpointId of internalBreakpoints) {
        try {
          await this.processManager.sendCommand('Debugger.removeBreakpoint', {
            breakpointId,
          });
          console.log(`Session ${this.id}: Cleared internal breakpoint ${breakpointId}`);
        } catch (error) {
          console.warn(
            `Session ${this.id}: Failed to clear internal breakpoint ${breakpointId}:`,
            error,
          );
        }
      }
    };

    // If we have user breakpoints and we're paused at the internal line 0 breakpoint,
    // we need to wait for scripts to be fully parsed, then resume to hit user breakpoints
    let actualInitialPause = initialPause;
    if (createdBreakpoints && createdBreakpoints.length > 0 && initialPause) {
      console.log(`Session ${this.id}: Have user breakpoints and paused at internal breakpoint`);

      // Wait for breakpoint resolution by checking periodically
      // The script parsing and source map loading happens asynchronously
      let waitAttempts = 0;
      const maxAttempts = 20; // 2 seconds total
      let hasResolvedBreakpoints = false;

      while (waitAttempts < maxAttempts && !hasResolvedBreakpoints) {
        await delay(100);
        waitAttempts++;

        // Re-fetch breakpoint status to see if they've been resolved
        for (const bp of createdBreakpoints) {
          const record = this.breakpointManager.getBreakpointRecord(bp.id);
          if (record && record.resolved && record.resolved.length > 0) {
            hasResolvedBreakpoints = true;
            console.log(`Session ${this.id}: Breakpoint ${bp.id} resolved to ${record.resolved.length} location(s) after ${waitAttempts * 100}ms`);
            // Update the createdBreakpoints array with resolved locations
            bp.resolvedLocations = record.resolved;
          }
        }
      }

      console.log(`Session ${this.id}: Waited ${waitAttempts * 100}ms for breakpoint resolution`);

      // Clear internal breakpoints since we don't need them anymore
      await clearInternalBreakpoints();

      if (hasResolvedBreakpoints) {
        // Resume from the internal breakpoint to hit the actual user breakpoint
        await this.processManager.sendCommand('Debugger.resume');
        console.log(`Session ${this.id}: Resumed from internal breakpoint, waiting for user breakpoint hit`);

        // Wait for the actual user breakpoint to be hit
        try {
          actualInitialPause = await this.waitForPause(
            'User breakpoint hit',
            false,
          );
          console.log(`Session ${this.id}: Hit user breakpoint`);
        } catch (error) {
          console.warn(
            `Session ${this.id}: Failed to hit user breakpoint after resuming from internal breakpoint: ${error instanceof Error ? error.message : String(error)}`,
          );
          // If we don't hit a user breakpoint, that's okay - execution might have completed
          actualInitialPause = undefined;
        }
      } else {
        console.log(`Session ${this.id}: No resolved breakpoints found after waiting, continuing with internal pause`);
      }
    } else if (this.config.resumeAfterConfigure) {
      // Clear internal breakpoints immediately before resuming if we're not waiting for user breakpoints
      console.log(`Session ${this.id}: No user breakpoints and resumeAfterConfigure=true, clearing internal breakpoints before resume`);
      await clearInternalBreakpoints();
    } else {
      // Clear internal breakpoints after a delay if we're paused and not resuming
      setTimeout(() => {
        void clearInternalBreakpoints();
      }, 1000);
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
      initialPause: actualInitialPause,
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
        console.log(`Session ${this.id}: runCommand 'continue' called, current status: ${this.status}`);
        await this.tryRunIfWaitingForDebugger();
        if (this.status === 'paused') {
          console.log(`Session ${this.id}: Sending Debugger.resume from runCommand`);
          await this.processManager.sendCommand('Debugger.resume');
          await this.waitForResumed('resume');
          console.log(`Session ${this.id}: Resumed successfully from runCommand`);
        }
        this.updateStatus('running');
        // Wait for next pause or termination
        pauseDetails = await this.waitForPauseOrTermination('continue');
        if (pauseDetails) {
          console.log(`Session ${this.id}: Paused after continue at breakpoint`);
        } else {
          console.log(`Session ${this.id}: Session terminated after continue`);
          resumed = false; // Session terminated, not resumed
        }
        console.log(`Session ${this.id}: runCommand 'continue' completed, status now: ${this.status}`);
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
    }, 100);
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
      console.log(`Session ${this.id}: Sending Debugger.resume command`);
      await this.processManager.sendCommand('Debugger.resume');
      await this.waitForResumed('resume');
      console.log(`Session ${this.id}: Successfully resumed execution`);
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

  private async waitForPauseOrTermination(
    reason: string,
  ): Promise<PauseDetails | null> {
    return Promise.race([
      this.events.once('paused'),
      this.events.once('terminated').then(() => null),
    ]);
  }

  private async waitForResumed(reason: string): Promise<void> {
    console.log(`Session ${this.id}: waitForResumed called, current status: ${this.status}`);
    if (this.status === 'running' || this.status === 'awaiting-debugger') {
      console.log(`Session ${this.id}: Already running/awaiting-debugger, returning immediately`);
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
