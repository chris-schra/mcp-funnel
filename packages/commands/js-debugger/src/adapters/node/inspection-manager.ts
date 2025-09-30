import type {
  ITypedCDPClient,
  DebugState,
  StackFrame,
  Scope,
  EvaluationResult,
} from '../../types/index.js';
import type { CDPDebuggerPausedParams } from '../../cdp/types.js';
import { determineCodeOrigin } from './code-origin.js';
import type { ScopeInspector } from './scope-inspector.js';

/**
 * Manages inspection operations during Node.js debugging.
 *
 * Handles variable evaluation, stack trace retrieval, and scope inspection
 * when the debugger is paused. Coordinates between CDP client, scope inspector,
 * and script ID mappings.
 * @public
 * @see file:../node-adapter.ts:81 - NodeDebugAdapter usage
 * @see file:./scope-inspector.ts:15 - ScopeInspector
 */
export class InspectionManager {
  /**
   * Creates an inspection manager instance.
   * @param cdpClient - CDP client for evaluation and property queries
   * @param scopeInspector - Inspector for analyzing variable scopes
   * @param scriptIdToUrl - Map of CDP script IDs to file URLs
   * @param getCurrentCallFrameId - Function to get current frame ID when paused
   * @param getCurrentCallFrames - Function to get all call frames when paused
   * @param getDebugState - Function to get current debug state
   */
  public constructor(
    private readonly cdpClient: ITypedCDPClient,
    private readonly scopeInspector: ScopeInspector,
    private readonly scriptIdToUrl: Map<string, string>,
    private readonly getCurrentCallFrameId: () => string | undefined,
    private readonly getCurrentCallFrames: () =>
      | CDPDebuggerPausedParams['callFrames']
      | undefined,
    private readonly getDebugState: () => DebugState,
  ) {}

  /**
   * Evaluates a JavaScript expression in the current debug context.
   *
   * When paused, evaluates the expression in the context of the current call frame,
   * with access to local variables and scope chain. When running, evaluates in the
   * global context.
   *
   * The expression can access local variables, closure variables, and global objects.
   * Side effects from the expression affect the running program.
   * @param expression - JavaScript expression to evaluate (e.g., 'x + y', 'user.name')
   * @returns Promise resolving to evaluation result with value, type, and optional error
   * @example Evaluating variables
   * ```typescript
   * await adapter.waitForPause();
   * const result = await adapter.evaluate('userCount');
   * console.log(result.value); // e.g., 42
   * ```
   * @example Complex expressions
   * ```typescript
   * const result = await adapter.evaluate('users.filter(u => u.active).length');
   * if (result.type !== 'error') {
   *   console.log(`Active users: ${result.value}`);
   * }
   * ```
   * @public
   * @see file:./scope-inspector.ts:45 - Scope evaluation implementation
   */
  public async evaluate(expression: string): Promise<EvaluationResult> {
    const frameId = this.getCurrentCallFrameId();

    if (frameId) {
      return this.scopeInspector.evaluateInScope(
        expression,
        frameId,
        this.cdpClient,
      );
    }

    const result = await this.cdpClient.send<{
      result: {
        type: string;
        value?: unknown;
        description?: string;
      };
      exceptionDetails?: {
        text: string;
      };
    }>('Runtime.evaluate', {
      expression,
      returnByValue: true,
    });

    if (result.exceptionDetails) {
      return {
        value: undefined,
        type: 'error',
        error: result.exceptionDetails.text,
      };
    }

    return {
      value: result.result.value,
      type: result.result.type,
      description: result.result.description,
    };
  }

  /**
   * Retrieves the current call stack when debugger is paused.
   *
   * Returns an empty array if not paused or if no frames are available.
   * Each frame includes function name, file location, line/column numbers,
   * and code origin classification (user vs node_modules vs node internals).
   *
   * Frame IDs are array indices (0-based), with 0 being the current frame.
   * @returns Promise resolving to array of stack frames (empty if not paused)
   * @example
   * ```typescript
   * await adapter.waitForPause();
   * const frames = await adapter.getStackTrace();
   * frames.forEach((frame, i) => {
   *   console.log(`${i}: ${frame.functionName} at ${frame.file}:${frame.line}`);
   * });
   * ```
   * @public
   * @see file:../../types/evaluation.ts:20 - StackFrame type
   * @see file:./code-origin.ts:15 - Code origin classification
   */
  public async getStackTrace(): Promise<StackFrame[]> {
    const frames = this.getCurrentCallFrames();
    const state = this.getDebugState();

    if (!frames || state.status !== 'paused') {
      return [];
    }

    return frames.map((frame, idx) => ({
      id: idx,
      functionName: frame.functionName || '<anonymous>',
      file:
        frame.url || this.scriptIdToUrl.get(frame.location.scriptId) || 'unknown',
      line: frame.location.lineNumber + 1, // Convert to 1-based
      column: frame.location.columnNumber,
      origin: determineCodeOrigin(
        frame.url || this.scriptIdToUrl.get(frame.location.scriptId),
      ),
    }));
  }

  /**
   * Retrieves variable scopes for a specific stack frame.
   *
   * Returns scopes in order from innermost to outermost (local, closure, global).
   * Each scope contains variable names and their values. Only available when paused.
   * @param frameId - Stack frame index (0 = current frame, from getStackTrace)
   * @returns Promise resolving to array of scopes with variables (empty if frame not found or not paused)
   * @example
   * ```typescript
   * await adapter.waitForPause();
   * const scopes = await adapter.getScopes(0); // Current frame
   * scopes.forEach(scope => {
   *   console.log(`${scope.type}: ${Object.keys(scope.variables).join(', ')}`);
   * });
   * ```
   * @public
   * @see file:../../types/evaluation.ts:30 - Scope type
   * @see file:./scope-inspector.ts:60 - Scope inspection implementation
   */
  public async getScopes(frameId: number): Promise<Scope[]> {
    const frames = this.getCurrentCallFrames();

    if (!frames || !frames[frameId]) {
      return [];
    }

    const frame = frames[frameId];
    return this.scopeInspector.inspectScopes(frame.scopeChain, this.cdpClient);
  }
}
