import { DebugState, EvaluationResult } from '../../types/index.js';
import { CDPClient, CDPCallFrame, CDPEvaluateResult } from '../../cdp/index.js';
import { BrowserEventHandlers } from './event-handlers.js';

/**
 * Manages execution control for browser debugging (stepping, evaluation)
 *
 * Provides methods to control debugger execution flow including resuming,
 * stepping through code, and evaluating expressions in the paused context.
 * @internal
 */
export class ExecutionControl {
  private cdpClient: CDPClient;
  private eventHandlers: BrowserEventHandlers;

  public constructor(cdpClient: CDPClient, eventHandlers: BrowserEventHandlers) {
    this.cdpClient = cdpClient;
    this.eventHandlers = eventHandlers;
  }

  /**
   * Resume execution until next breakpoint or completion.
   * @returns Promise resolving to running state
   * @throws \{Error\} When CDP resume command fails
   */
  public async continue(): Promise<DebugState> {
    try {
      await this.cdpClient.send('Debugger.resume');
      return { status: 'running' };
    } catch (error) {
      throw new Error(
        `Failed to continue: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Step over the current line, executing function calls without entering them.
   * @param debugState - Current debug state to preserve and return
   * @returns Promise resolving to the provided debug state (updated by event handlers)
   * @throws \{Error\} When CDP stepOver command fails
   */
  public async stepOver(debugState: DebugState): Promise<DebugState> {
    try {
      await this.cdpClient.send('Debugger.stepOver');
      return debugState;
    } catch (error) {
      throw new Error(
        `Failed to step over: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Step into the next function call, entering function bodies.
   * @param debugState - Current debug state to preserve and return
   * @returns Promise resolving to the provided debug state (updated by event handlers)
   * @throws \{Error\} When CDP stepInto command fails
   */
  public async stepInto(debugState: DebugState): Promise<DebugState> {
    try {
      await this.cdpClient.send('Debugger.stepInto');
      return debugState;
    } catch (error) {
      throw new Error(
        `Failed to step into: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Step out of the current function, continuing until the caller is reached.
   * @param debugState - Current debug state to preserve and return
   * @returns Promise resolving to the provided debug state (updated by event handlers)
   * @throws \{Error\} When CDP stepOut command fails
   */
  public async stepOut(debugState: DebugState): Promise<DebugState> {
    try {
      await this.cdpClient.send('Debugger.stepOut');
      return debugState;
    } catch (error) {
      throw new Error(
        `Failed to step out: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Evaluate a JavaScript expression in the context of the top call frame.
   *
   * Uses the first frame's callFrameId to evaluate the expression with access
   * to the current scope and variables. Returns evaluation results including
   * value, type, and any errors encountered.
   * @param expression - JavaScript expression to evaluate
   * @param currentCallFrames - Stack frames from paused debugger (uses first frame)
   * @returns Promise resolving to evaluation result with value, type, and optional error
   */
  public async evaluate(
    expression: string,
    currentCallFrames: CDPCallFrame[],
  ): Promise<EvaluationResult> {
    try {
      const callFrameId = currentCallFrames[0]?.callFrameId;

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
}
