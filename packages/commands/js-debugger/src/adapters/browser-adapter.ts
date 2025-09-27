import Emittery from 'emittery';
import {
  IDebugAdapter,
  DebugState,
  StackFrame,
  Scope,
  EvaluationResult,
  ConsoleHandler,
  PauseHandler,
  ResumeHandler,
  BreakpointRegistration,
  DebugRequest,
  DebugSessionEvents,
} from '../types/index.js';
import { CDPClient, CDPCallFrame } from '../cdp/index.js';
import { deriveProjectRootFromRequest } from '../utils/locations.js';
import { PageManager } from './browser/page-manager.js';
import { BrowserConsoleHandler } from './browser/console-handler.js';
import { BrowserEventHandlers } from './browser/event-handlers.js';
import { BreakpointManager } from './browser/breakpoint-manager.js';
import { ExecutionControl } from './browser/execution-control.js';
import {
  filePathToUrl,
  buildStackTrace,
  getFrameScopes,
} from './browser/utils.js';
import type { ScriptInfo } from './browser/handlers/script-handler.js';

type BrowserAdapterOptions = {
  host?: string;
  port?: number;
  request?: DebugRequest;
};

/**
 * Browser debugging adapter using Chrome DevTools Protocol
 * Handles debugging JavaScript in Chrome, Edge, and other Chromium browsers
 */
export class BrowserAdapter implements IDebugAdapter {
  private cdpClient: CDPClient;
  private pageManager: PageManager;
  private consoleHandler: BrowserConsoleHandler;
  private eventHandlers: BrowserEventHandlers;
  private breakpointManager: BreakpointManager;
  private executionControl: ExecutionControl;
  private isConnected = false;
  private scripts = new Map<string, ScriptInfo>();
  private currentCallFrames: CDPCallFrame[] = [];
  private debugState: DebugState = { status: 'running' };
  private projectRoot?: string;

  // Event emitter for typed events
  private eventEmitter = new Emittery<DebugSessionEvents>();

  // Pause state management
  private pausePromises = new Set<{
    resolve: (state: DebugState) => void;
    reject: (error: Error) => void;
    timeout?: NodeJS.Timeout;
  }>();

  constructor(options?: BrowserAdapterOptions) {
    const host = options?.host ?? 'localhost';
    const port = options?.port ?? 9222;

    this.cdpClient = new CDPClient();
    this.pageManager = new PageManager(host, port);
    this.consoleHandler = new BrowserConsoleHandler(this.eventEmitter);
    this.projectRoot = deriveProjectRootFromRequest(options?.request);

    this.breakpointManager = new BreakpointManager(
      this.cdpClient,
      this.scripts,
      this.projectRoot,
    );

    this.eventHandlers = new BrowserEventHandlers(
      this.cdpClient,
      this.eventEmitter,
      this.consoleHandler,
      this.scripts,
      this.breakpointManager.getBreakpoints(),
      this.debugState,
      this.pausePromises,
      this.currentCallFrames,
      this.projectRoot,
      (state: DebugState) => {
        this.debugState = state;
      },
    );

    this.executionControl = new ExecutionControl(
      this.cdpClient,
      this.eventHandlers,
    );

    this.eventHandlers.setupEventHandlers();
  }

  async connect(target: string): Promise<void> {
    if (this.isConnected) {
      throw new Error('Already connected to a debugging target');
    }

    const browserTarget = await this.pageManager.findTarget(target);
    await this.cdpClient.connect(browserTarget.webSocketDebuggerUrl);
    await this.enableCDPDomains();

    this.isConnected = true;
    this.debugState = { status: 'running' };
  }

  async disconnect(): Promise<void> {
    if (!this.isConnected) return;

    this.rejectPendingPausePromises();
    await this.disableCDPDomains();
    await this.cdpClient.disconnect();
    this.resetState();
    this.eventEmitter.emit('terminated', undefined);
  }

  async navigate(url: string): Promise<void> {
    this.ensureConnected();
    await this.pageManager.navigate(this.cdpClient, url);
  }

  async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<BreakpointRegistration> {
    this.ensureConnected();
    const url = filePathToUrl(file);
    const registration = await this.breakpointManager.setBreakpoint(
      url,
      line,
      condition,
    );

    if (registration.verified) {
      this.eventEmitter.emit('breakpointResolved', registration);
    }

    return registration;
  }

  async removeBreakpoint(id: string): Promise<void> {
    this.ensureConnected();
    await this.breakpointManager.removeBreakpoint(id);
  }

  async continue(): Promise<DebugState> {
    this.ensureConnected();
    this.debugState = await this.executionControl.continue();
    this.eventHandlers.updateState(this.debugState, this.projectRoot);
    return this.debugState;
  }

  async stepOver(): Promise<DebugState> {
    this.ensureConnected();
    this.debugState = await this.executionControl.stepOver(this.debugState);
    this.eventHandlers.updateState(this.debugState, this.projectRoot);
    return this.debugState;
  }

  async stepInto(): Promise<DebugState> {
    this.ensureConnected();
    this.debugState = await this.executionControl.stepInto(this.debugState);
    this.eventHandlers.updateState(this.debugState, this.projectRoot);
    return this.debugState;
  }

  async stepOut(): Promise<DebugState> {
    this.ensureConnected();
    this.debugState = await this.executionControl.stepOut(this.debugState);
    this.eventHandlers.updateState(this.debugState, this.projectRoot);
    return this.debugState;
  }

  async evaluate(expression: string): Promise<EvaluationResult> {
    this.ensureConnected();
    return await this.executionControl.evaluate(
      expression,
      this.currentCallFrames,
    );
  }

  async getStackTrace(): Promise<StackFrame[]> {
    if (!this.isConnected || this.debugState.status !== 'paused') {
      return [];
    }

    return buildStackTrace(this.currentCallFrames, this.projectRoot);
  }

  async getScopes(frameId: number): Promise<Scope[]> {
    if (!this.isConnected || frameId >= this.currentCallFrames.length) {
      return [];
    }

    const frame = this.currentCallFrames[frameId];
    return getFrameScopes(this.cdpClient, frame);
  }

  onConsoleOutput(handler: ConsoleHandler): void {
    this.consoleHandler.onConsoleOutput(handler);
  }

  onPaused(handler: PauseHandler): void {
    this.eventHandlers.onPaused(handler);
  }

  onResumed(handler: ResumeHandler): void {
    this.eventHandlers.onResumed(handler);
  }

  onBreakpointResolved(
    handler: (registration: BreakpointRegistration) => void,
  ): void {
    this.eventHandlers.onBreakpointResolved(handler);
  }

  on<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): () => void {
    return this.eventEmitter.on(event, handler);
  }

  off<K extends keyof DebugSessionEvents>(
    event: K,
    handler: (data: DebugSessionEvents[K]) => void,
  ): void {
    this.eventEmitter.off(event, handler);
  }

  async waitForPause(timeoutMs = 30000): Promise<DebugState> {
    if (this.debugState.status === 'paused') {
      return this.debugState;
    }

    return new Promise<DebugState>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pausePromises.delete(promiseInfo);
        reject(new Error(`waitForPause timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      const promiseInfo = { resolve, reject, timeout };
      this.pausePromises.add(promiseInfo);
    });
  }

  getCurrentState(): DebugState {
    return { ...this.debugState };
  }

  private async enableCDPDomains(): Promise<void> {
    await Promise.all([
      this.cdpClient.send('Runtime.enable'),
      this.cdpClient.send('Debugger.enable'),
      this.cdpClient.send('Console.enable'),
      this.cdpClient.send('Page.enable'),
    ]);

    await this.cdpClient.send('Debugger.setPauseOnExceptions', {
      state: 'uncaught',
    });
  }

  private async disableCDPDomains(): Promise<void> {
    try {
      await Promise.all([
        this.cdpClient.send('Debugger.disable'),
        this.cdpClient.send('Runtime.disable'),
        this.cdpClient.send('Console.disable'),
        this.cdpClient.send('Page.disable'),
      ]);
    } catch (_error) {
      // Ignore errors during cleanup
    }
  }

  private rejectPendingPausePromises(): void {
    const terminationError = new Error('Debug session terminated');
    Array.from(this.pausePromises).forEach((promise) => {
      if (promise.timeout) clearTimeout(promise.timeout);
      promise.reject(terminationError);
    });
    this.pausePromises.clear();
  }

  private resetState(): void {
    this.isConnected = false;
    this.pageManager.clearTarget();
    this.scripts.clear();
    this.breakpointManager.clearBreakpoints();
    this.currentCallFrames = [];
    this.debugState = { status: 'terminated' };
  }

  private ensureConnected(): void {
    if (!this.isConnected) {
      throw new Error('Not connected to debugging target');
    }
  }
}
