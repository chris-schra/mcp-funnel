import {
  IDebugAdapter,
  DebugState,
  StackFrame,
  Scope,
  EvaluationResult,
  ConsoleHandler,
  PauseHandler,
  ResumeHandler,
} from '../types/index.js';
import {
  CDPClient,
  TargetDiscovery,
  BrowserTarget,
  CDPBreakpoint,
  CDPCallFrame,
  CDPDebuggerPausedParams,
  CDPScriptParsedParams,
  CDPConsoleAPICalledParams,
  CDPExceptionThrownParams,
  CDPEvaluateResult,
} from '../cdp/index.js';
import { SourceMapConsumer } from 'source-map';
import {
  filePathToUrl,
  urlToFilePath,
  getScopesForFrame,
  invokeHandlers,
} from './browser-adapter-utils.js';
import { enableCDPDomains, disableCDPDomains } from './browser-cdp-setup.js';
import { findOrCreateTarget } from './browser-target-utils.js';
import {
  handleDebuggerPaused,
  handleScriptParsed,
  handleConsoleMessage,
  handleException,
} from './browser-event-handlers.js';

/**
 * Browser debugging adapter using Chrome DevTools Protocol
 * Handles debugging JavaScript in Chrome, Edge, and other Chromium browsers
 */
export class BrowserAdapter implements IDebugAdapter {
  private cdpClient: CDPClient;
  private targetDiscovery: TargetDiscovery;
  private currentTarget: BrowserTarget | null = null;
  private isConnected = false;
  private scripts = new Map<
    string,
    { url: string; source?: string; sourceMap?: SourceMapConsumer }
  >();
  private breakpoints = new Map<string, CDPBreakpoint>();
  private currentCallFrames: CDPCallFrame[] = [];
  private debugState: DebugState = { status: 'running' };

  // Event handlers
  private consoleHandlers: ConsoleHandler[] = [];
  private pauseHandlers: PauseHandler[] = [];
  private resumeHandlers: ResumeHandler[] = [];

  public constructor(host = 'localhost', port = 9222) {
    this.cdpClient = new CDPClient();
    this.targetDiscovery = new TargetDiscovery(host, port);

    this.setupEventHandlers();
  }

  /**
   * Connect to a browser debugging target
   * @param target URL pattern, target ID, or 'auto' to connect to first page
   */
  public async connect(target: string): Promise<void> {
    if (this.isConnected) {
      throw new Error('Already connected to a debugging target');
    }

    // Check if endpoint is available
    const isAvailable = await this.targetDiscovery.isAvailable();
    if (!isAvailable) {
      throw new Error(
        'Chrome DevTools endpoint not available. Make sure Chrome is running with --remote-debugging-port=9222',
      );
    }

    // Find or create target
    const browserTarget = await findOrCreateTarget(
      this.targetDiscovery,
      target,
    );
    this.currentTarget = browserTarget;

    // Connect CDP client to target's WebSocket
    await this.cdpClient.connect(browserTarget.webSocketDebuggerUrl);

    // Enable required CDP domains
    await enableCDPDomains(this.cdpClient);

    this.isConnected = true;
    this.debugState = { status: 'running' };
  }

  /**
   * Disconnect from debugging target
   */
  public async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    await disableCDPDomains(this.cdpClient);
    await this.cdpClient.disconnect();

    this.isConnected = false;
    this.currentTarget = null;
    this.scripts.clear();
    this.breakpoints.clear();
    this.currentCallFrames = [];
    this.debugState = { status: 'terminated' };
  }

  /**
   * Navigate the connected target to a URL
   */
  public async navigate(url: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugging target');
    }

    await this.cdpClient.send('Page.navigate', { url });
  }

  /**
   * Set a breakpoint at specified file and line
   */
  public async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<string> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugging target');
    }

    // Convert file path to URL for browser context
    const url = filePathToUrl(file);

    try {
      const result = await this.cdpClient.send<{
        breakpointId: string;
        locations: Array<{
          scriptId: string;
          lineNumber: number;
          columnNumber?: number;
        }>;
      }>('Debugger.setBreakpointByUrl', {
        url,
        lineNumber: line - 1, // CDP uses 0-based line numbers
        condition,
      });

      this.breakpoints.set(result.breakpointId, result);

      return result.breakpointId;
    } catch (error) {
      throw new Error(
        `Failed to set breakpoint: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Remove a breakpoint by ID
   */
  public async removeBreakpoint(id: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugging target');
    }

    try {
      await this.cdpClient.send('Debugger.removeBreakpoint', {
        breakpointId: id,
      });

      this.breakpoints.delete(id);
    } catch (error) {
      throw new Error(
        `Failed to remove breakpoint: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Continue execution
   */
  public async continue(): Promise<DebugState> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugging target');
    }

    try {
      await this.cdpClient.send('Debugger.resume');
      this.debugState = { status: 'running' };

      // Notify resume handlers
      invokeHandlers(this.resumeHandlers, undefined, 'resume');

      return this.debugState;
    } catch (error) {
      throw new Error(
        `Failed to continue: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Step over current line
   */
  public async stepOver(): Promise<DebugState> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugging target');
    }

    try {
      await this.cdpClient.send('Debugger.stepOver');
      return this.debugState;
    } catch (error) {
      throw new Error(
        `Failed to step over: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Step into function call
   */
  public async stepInto(): Promise<DebugState> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugging target');
    }

    try {
      await this.cdpClient.send('Debugger.stepInto');
      return this.debugState;
    } catch (error) {
      throw new Error(
        `Failed to step into: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Step out of current function
   */
  public async stepOut(): Promise<DebugState> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugging target');
    }

    try {
      await this.cdpClient.send('Debugger.stepOut');
      return this.debugState;
    } catch (error) {
      throw new Error(
        `Failed to step out: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Evaluate an expression in the current context
   */
  public async evaluate(expression: string): Promise<EvaluationResult> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugging target');
    }

    try {
      const callFrameId = this.currentCallFrames[0]?.callFrameId;

      const result = await this.cdpClient.send<CDPEvaluateResult>(
        'Debugger.evaluateOnCallFrame',
        {
          callFrameId,
          expression,
          generatePreview: true,
        },
      );

      if (result.exceptionDetails) {
        return {
          value: undefined,
          type: 'undefined',
          error:
            result.exceptionDetails.exception.description || 'Evaluation error',
        };
      }

      return {
        value: result.result.value,
        type: result.result.type,
        description: result.result.description,
      };
    } catch (error) {
      return {
        value: undefined,
        type: 'undefined',
        error: `Evaluation failed: ${error instanceof Error ? error.message : error}`,
      };
    }
  }

  /**
   * Get current stack trace
   */
  public async getStackTrace(): Promise<StackFrame[]> {
    if (!this.isConnected || this.debugState.status !== 'paused') {
      return [];
    }

    return this.currentCallFrames.map((frame, index) => ({
      id: index,
      functionName: frame.functionName || '(anonymous)',
      file: urlToFilePath(frame.url),
      line: frame.location.lineNumber + 1, // Convert to 1-based
      column: frame.location.columnNumber,
    }));
  }

  /**
   * Get variable scopes for a stack frame
   */
  public async getScopes(frameId: number): Promise<Scope[]> {
    if (!this.isConnected || frameId >= this.currentCallFrames.length) {
      return [];
    }

    const frame = this.currentCallFrames[frameId];
    return getScopesForFrame(this.cdpClient, frame);
  }

  /**
   * Register console output handler
   */
  public onConsoleOutput(handler: ConsoleHandler): void {
    this.consoleHandlers.push(handler);
  }

  /**
   * Register pause handler
   */
  public onPaused(handler: PauseHandler): void {
    this.pauseHandlers.push(handler);
  }

  /**
   * Register resume handler
   */
  public onResumed(handler: ResumeHandler): void {
    this.resumeHandlers.push(handler);
  }

  /**
   * Setup CDP event handlers
   */
  private setupEventHandlers(): void {
    this.cdpClient.on('Debugger.paused', (params: unknown) => {
      const result = handleDebuggerPaused(
        params as CDPDebuggerPausedParams,
        this.breakpoints,
        this.pauseHandlers,
      );
      this.currentCallFrames = result.callFrames;
      this.debugState = result.debugState;
    });
    this.cdpClient.on('Debugger.resumed', () => {
      this.debugState = { status: 'running' };
      this.currentCallFrames = [];
    });
    this.cdpClient.on('Debugger.scriptParsed', (params: unknown) =>
      handleScriptParsed(params as CDPScriptParsedParams, this.scripts),
    );
    this.cdpClient.on('Runtime.consoleAPICalled', (params: unknown) =>
      handleConsoleMessage(
        params as CDPConsoleAPICalledParams,
        this.consoleHandlers,
      ),
    );
    this.cdpClient.on('Runtime.exceptionThrown', (params: unknown) =>
      handleException(params as CDPExceptionThrownParams, this.consoleHandlers),
    );
  }
}
