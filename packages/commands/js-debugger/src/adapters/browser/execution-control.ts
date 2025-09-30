import { DebugState, EvaluationResult } from '../../types/index.js';
import { CDPClient, CDPCallFrame, CDPEvaluateResult } from '../../cdp/index.js';
import { BrowserEventHandlers } from './event-handlers.js';

/**
 * Manages execution control for browser debugging (stepping, evaluation)
 */
export class ExecutionControl {
  private cdpClient: CDPClient;
  private eventHandlers: BrowserEventHandlers;

  constructor(cdpClient: CDPClient, eventHandlers: BrowserEventHandlers) {
    this.cdpClient = cdpClient;
    this.eventHandlers = eventHandlers;
  }

  /**
   * Continue execution
   */
  async continue(): Promise<DebugState> {
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
   * Step over current line
   */
  async stepOver(debugState: DebugState): Promise<DebugState> {
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
   * Step into function call
   */
  async stepInto(debugState: DebugState): Promise<DebugState> {
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
   * Step out of current function
   */
  async stepOut(debugState: DebugState): Promise<DebugState> {
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
   * Evaluate an expression in the current context
   */
  async evaluate(
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
