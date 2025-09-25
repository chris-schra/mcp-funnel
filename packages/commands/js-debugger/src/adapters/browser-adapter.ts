import {
  IDebugAdapter,
  DebugState,
  StackFrame,
  Scope,
  Variable,
  EvaluationResult,
  ConsoleMessage,
  ConsoleHandler,
  PauseHandler,
  ResumeHandler,
} from '../types.js';
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
  CDPGetPropertiesResult,
  CDPStackTrace,
} from '../cdp/index.js';
import { SourceMapConsumer } from 'source-map';

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

  constructor(host = 'localhost', port = 9222) {
    this.cdpClient = new CDPClient();
    this.targetDiscovery = new TargetDiscovery(host, port);

    this.setupEventHandlers();
  }

  /**
   * Connect to a browser debugging target
   * @param target URL pattern, target ID, or 'auto' to connect to first page
   */
  async connect(target: string): Promise<void> {
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
    let browserTarget: BrowserTarget | undefined;

    if (target === 'auto') {
      browserTarget = await this.targetDiscovery.findFirstPageTarget();
      if (!browserTarget) {
        // Create a new blank page if no existing page found
        browserTarget = await this.targetDiscovery.createTarget('about:blank');
      }
    } else if (target.startsWith('http')) {
      // Target is a URL pattern
      browserTarget = await this.targetDiscovery.findTarget(target);
      if (!browserTarget) {
        // Create a new page with this URL
        browserTarget = await this.targetDiscovery.createTarget(target);
      }
    } else {
      // Target might be a target ID or title
      const targets = await this.targetDiscovery.listTargets();
      browserTarget = targets.find(
        (t: BrowserTarget) => t.id === target || t.title.includes(target),
      );
    }

    if (!browserTarget) {
      throw new Error(`Could not find or create target: ${target}`);
    }

    this.currentTarget = browserTarget;

    // Connect CDP client to target's WebSocket
    await this.cdpClient.connect(browserTarget.webSocketDebuggerUrl);

    // Enable required CDP domains
    await this.enableCDPDomains();

    this.isConnected = true;
    this.debugState = { status: 'running' };
  }

  /**
   * Disconnect from debugging target
   */
  async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    try {
      // Disable CDP domains
      await this.cdpClient.send('Debugger.disable');
      await this.cdpClient.send('Runtime.disable');
      await this.cdpClient.send('Console.disable');
      await this.cdpClient.send('Page.disable');
    } catch (_error) {
      // Ignore errors during cleanup
    }

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
  async navigate(url: string): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugging target');
    }

    await this.cdpClient.send('Page.navigate', { url });
  }

  /**
   * Set a breakpoint at specified file and line
   */
  async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<string> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugging target');
    }

    // Convert file path to URL for browser context
    const url = this.filePathToUrl(file);

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
  async removeBreakpoint(id: string): Promise<void> {
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
  async continue(): Promise<DebugState> {
    if (!this.isConnected) {
      throw new Error('Not connected to debugging target');
    }

    try {
      await this.cdpClient.send('Debugger.resume');
      this.debugState = { status: 'running' };

      // Notify resume handlers
      this.resumeHandlers.forEach((handler) => {
        try {
          handler();
        } catch (error) {
          console.warn('Error in resume handler:', error);
        }
      });

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
  async stepOver(): Promise<DebugState> {
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
  async stepInto(): Promise<DebugState> {
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
  async stepOut(): Promise<DebugState> {
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
  async evaluate(expression: string): Promise<EvaluationResult> {
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
  async getStackTrace(): Promise<StackFrame[]> {
    if (!this.isConnected || this.debugState.status !== 'paused') {
      return [];
    }

    return this.currentCallFrames.map((frame, index) => ({
      id: index,
      functionName: frame.functionName || '(anonymous)',
      file: this.urlToFilePath(frame.url),
      line: frame.location.lineNumber + 1, // Convert to 1-based
      column: frame.location.columnNumber,
    }));
  }

  /**
   * Get variable scopes for a stack frame
   */
  async getScopes(frameId: number): Promise<Scope[]> {
    if (!this.isConnected || frameId >= this.currentCallFrames.length) {
      return [];
    }

    const frame = this.currentCallFrames[frameId];
    const scopes: Scope[] = [];

    for (const scopeChain of frame.scopeChain) {
      if (!scopeChain.object.objectId) {
        continue;
      }

      try {
        const properties = await this.cdpClient.send<CDPGetPropertiesResult>(
          'Runtime.getProperties',
          {
            objectId: scopeChain.object.objectId,
            ownProperties: true,
          },
        );

        const variables: Variable[] = properties.result.map((prop) => ({
          name: prop.name,
          value: prop.value.value,
          type: prop.value.type,
          configurable: prop.configurable,
          enumerable: prop.enumerable,
        }));

        const scopeType =
          scopeChain.type === 'script' ? 'global' : scopeChain.type;
        scopes.push({
          type: scopeType as Scope['type'],
          name: scopeChain.name,
          variables,
        });
      } catch (error) {
        console.warn(
          `Failed to get properties for scope ${scopeChain.type}:`,
          error,
        );
      }
    }

    return scopes;
  }

  /**
   * Register console output handler
   */
  onConsoleOutput(handler: ConsoleHandler): void {
    this.consoleHandlers.push(handler);
  }

  /**
   * Register pause handler
   */
  onPaused(handler: PauseHandler): void {
    this.pauseHandlers.push(handler);
  }

  /**
   * Register resume handler
   */
  onResumed(handler: ResumeHandler): void {
    this.resumeHandlers.push(handler);
  }

  /**
   * Setup CDP event handlers
   */
  private setupEventHandlers(): void {
    // Debugger events
    this.cdpClient.on('Debugger.paused', (params: unknown) => {
      this.handleDebuggerPaused(params as CDPDebuggerPausedParams);
    });

    this.cdpClient.on('Debugger.resumed', () => {
      this.debugState = { status: 'running' };
      this.currentCallFrames = [];
    });

    this.cdpClient.on('Debugger.scriptParsed', (params: unknown) => {
      this.handleScriptParsed(params as CDPScriptParsedParams);
    });

    // Console events
    this.cdpClient.on('Runtime.consoleAPICalled', (params: unknown) => {
      this.handleConsoleMessage(params as CDPConsoleAPICalledParams);
    });

    this.cdpClient.on('Runtime.exceptionThrown', (params: unknown) => {
      this.handleException(params as CDPExceptionThrownParams);
    });
  }

  /**
   * Enable required CDP domains
   */
  private async enableCDPDomains(): Promise<void> {
    await this.cdpClient.send('Runtime.enable');
    await this.cdpClient.send('Debugger.enable');
    await this.cdpClient.send('Console.enable');
    await this.cdpClient.send('Page.enable');

    // Set pause on exceptions if needed
    await this.cdpClient.send('Debugger.setPauseOnExceptions', {
      state: 'uncaught', // Can be 'none', 'uncaught', or 'all'
    });
  }

  /**
   * Handle debugger paused event
   */
  private handleDebuggerPaused(params: CDPDebuggerPausedParams): void {
    this.currentCallFrames = params.callFrames;

    this.debugState = {
      status: 'paused',
      pauseReason: this.mapPauseReason(params.reason),
    };

    if (params.hitBreakpoints && params.hitBreakpoints.length > 0) {
      const breakpointId = params.hitBreakpoints[0];
      const breakpoint = this.breakpoints.get(breakpointId);

      if (breakpoint) {
        this.debugState.breakpoint = {
          id: breakpointId,
          file: '', // This needs to be mapped from script URL
          line: breakpoint.locations[0]?.lineNumber || 0,
        };
      }
    }

    // Notify pause handlers
    this.pauseHandlers.forEach((handler) => {
      try {
        handler(this.debugState);
      } catch (error) {
        console.warn('Error in pause handler:', error);
      }
    });
  }

  /**
   * Handle script parsed event
   */
  private handleScriptParsed(params: CDPScriptParsedParams): void {
    this.scripts.set(params.scriptId, {
      url: params.url,
      sourceMap: undefined, // Will be loaded if needed
    });

    // Load source map if available
    if (params.sourceMapURL) {
      this.loadSourceMap(params.scriptId, params.sourceMapURL).catch(
        (error) => {
          console.warn(`Failed to load source map for ${params.url}:`, error);
        },
      );
    }
  }

  /**
   * Handle console message
   */
  private handleConsoleMessage(params: CDPConsoleAPICalledParams): void {
    const message: ConsoleMessage = {
      level: this.mapConsoleLevel(params.type),
      timestamp: new Date(params.timestamp).toISOString(),
      message: params.args
        .map((arg) => arg.description || String(arg.value || ''))
        .join(' '),
      args: params.args.map((arg) => arg.value),
      stackTrace: params.stackTrace
        ? this.parseStackTrace(params.stackTrace)
        : undefined,
    };

    this.consoleHandlers.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        console.warn('Error in console handler:', error);
      }
    });
  }

  /**
   * Handle runtime exception
   */
  private handleException(params: CDPExceptionThrownParams): void {
    const message: ConsoleMessage = {
      level: 'error',
      timestamp: new Date().toISOString(),
      message:
        params.exceptionDetails.exception?.description ||
        params.exceptionDetails.text,
      args: [params.exceptionDetails.exception?.value],
      stackTrace: params.exceptionDetails.stackTrace
        ? this.parseStackTrace(params.exceptionDetails.stackTrace)
        : undefined,
    };

    this.consoleHandlers.forEach((handler) => {
      try {
        handler(message);
      } catch (error) {
        console.warn('Error in console handler:', error);
      }
    });
  }

  /**
   * Load source map for a script
   */
  private async loadSourceMap(
    scriptId: string,
    sourceMapURL: string,
  ): Promise<void> {
    try {
      // Handle relative URLs and data URLs
      let sourceMapContent: string;

      if (sourceMapURL.startsWith('data:')) {
        // Data URL
        const base64Data = sourceMapURL.split(',')[1];
        sourceMapContent = Buffer.from(base64Data, 'base64').toString('utf-8');
      } else if (sourceMapURL.startsWith('http')) {
        // Absolute URL - try to use built-in fetch or skip
        try {
          // Use Node.js built-in fetch (Node 18+) if available
          if (typeof globalThis.fetch === 'function') {
            const response = await globalThis.fetch(sourceMapURL);
            sourceMapContent = await response.text();
          } else {
            // Skip HTTP source maps if fetch is not available
            console.warn(
              `HTTP source map skipped (no fetch available): ${sourceMapURL}`,
            );
            return;
          }
        } catch (fetchError) {
          console.warn(
            `Failed to fetch source map from ${sourceMapURL}:`,
            fetchError,
          );
          return;
        }
      } else {
        // Relative path - this is tricky in browser context
        // For now, skip relative source maps
        return;
      }

      const sourceMapData = JSON.parse(sourceMapContent);
      const sourceMap = await new SourceMapConsumer(sourceMapData);
      const script = this.scripts.get(scriptId);
      if (script) {
        script.sourceMap = sourceMap;
      }
    } catch (error) {
      // Source map loading is best-effort
      console.warn(`Failed to load source map ${sourceMapURL}:`, error);
    }
  }

  /**
   * Convert file path to URL for browser context
   */
  private filePathToUrl(filePath: string): string {
    // For browser debugging, we expect URLs rather than file paths
    // If it's already a URL, return as-is
    if (
      filePath.startsWith('http://') ||
      filePath.startsWith('https://') ||
      filePath.startsWith('file://')
    ) {
      return filePath;
    }

    // Convert relative paths to file:// URLs as fallback
    if (filePath.startsWith('/')) {
      return `file://${filePath}`;
    }

    return `file://${filePath}`;
  }

  /**
   * Convert URL back to file path for display
   */
  private urlToFilePath(url: string): string {
    if (url.startsWith('file://')) {
      return url.slice(7);
    }
    return url;
  }

  /**
   * Map CDP pause reasons to our debug state reasons
   */
  private mapPauseReason(
    reason: string,
  ): 'breakpoint' | 'step' | 'exception' | 'entry' {
    switch (reason) {
      case 'breakpoint':
        return 'breakpoint';
      case 'exception':
        return 'exception';
      case 'debugCommand':
        return 'step';
      default:
        return 'entry';
    }
  }

  /**
   * Map CDP console types to our console levels
   */
  private mapConsoleLevel(
    type: string,
  ): 'log' | 'debug' | 'info' | 'warn' | 'error' | 'trace' {
    switch (type) {
      case 'warning':
        return 'warn';
      case 'trace':
        return 'trace';
      case 'error':
        return 'error';
      case 'debug':
        return 'debug';
      case 'info':
        return 'info';
      default:
        return 'log';
    }
  }

  /**
   * Parse CDP stack trace to our format
   */
  private parseStackTrace(stackTrace: CDPStackTrace): StackFrame[] {
    if (!stackTrace?.callFrames) {
      return [];
    }

    return stackTrace.callFrames.map((frame, index: number) => ({
      id: index,
      functionName: frame.functionName || '(anonymous)',
      file: this.urlToFilePath(frame.url),
      line: (frame.lineNumber || 0) + 1,
      column: frame.columnNumber,
    }));
  }
}
