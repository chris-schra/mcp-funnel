import type { ITypedCDPClient, DebugState } from '../../types/index.js';
import type { PauseHandlerManager } from './pause-handler.js';

/**
 * Manages execution control operations for Node.js debugging.
 *
 * Handles stepping, continuing, and waiting for pause events during debug sessions.
 * Delegates to CDP client for debugger commands and pause handler for state tracking.
 * @public
 * @see file:../node-adapter.ts:81 - NodeDebugAdapter usage
 * @see file:./pause-handler.ts:30 - PauseHandlerManager
 */
export class ExecutionControlManager {
  /**
   * Creates an execution control manager instance.
   * @param cdpClient - CDP client for sending debugger commands
   * @param pauseHandlerManager - Manager for handling pause promises
   * @param getDebugState - Function to get current debug state
   * @param setDebugState - Function to update debug state
   */
  public constructor(
    private readonly cdpClient: ITypedCDPClient,
    private readonly pauseHandlerManager: PauseHandlerManager,
    private readonly getDebugState: () => DebugState,
    private readonly setDebugState: (state: DebugState) => void,
  ) {}

  /**
   * Resumes execution from a paused state.
   *
   * Sends CDP resume command and transitions internal state to 'running'.
   * Program continues until next breakpoint, exception, or completion.
   * @returns Current debug state after resuming (status: 'running')
   * @example
   * ```typescript
   * await adapter.waitForPause();
   * const state = await adapter.continue();
   * console.log(state.status); // 'running'
   * ```
   * @public
   */
  public async continue(): Promise<DebugState> {
    await this.cdpClient.send('Debugger.resume');
    const newState: DebugState = { status: 'running' };
    this.setDebugState(newState);
    return newState;
  }

  /**
   * Steps over the current line (executes current line without stepping into function calls).
   *
   * If the current line contains a function call, the entire call executes and
   * debugger pauses at the next line. State remains unchanged until pause event.
   * @returns Current debug state (typically unchanged until next pause)
   * @public
   */
  public async stepOver(): Promise<DebugState> {
    await this.cdpClient.send('Debugger.stepOver');
    return this.getDebugState();
  }

  /**
   * Steps into the function call on the current line.
   *
   * If the current line contains a function call, debugger enters that function
   * and pauses at its first statement. If no function call, behaves like stepOver.
   * @returns Current debug state (typically unchanged until next pause)
   * @public
   */
  public async stepInto(): Promise<DebugState> {
    await this.cdpClient.send('Debugger.stepInto');
    return this.getDebugState();
  }

  /**
   * Steps out of the current function to the calling frame.
   *
   * Resumes execution until the current function returns, then pauses at the
   * return point in the caller. If already at the top level, behaves like continue.
   * @returns Current debug state (typically unchanged until next pause)
   * @public
   */
  public async stepOut(): Promise<DebugState> {
    await this.cdpClient.send('Debugger.stepOut');
    return this.getDebugState();
  }

  /**
   * Waits for the debugger to pause (at breakpoint, step, or exception).
   *
   * This method blocks until a pause event occurs or the timeout expires.
   * Useful for synchronizing execution flow after stepping or continuing.
   * @param timeoutMs - Maximum time to wait in milliseconds (default: 30000)
   * @returns Promise resolving to debug state when paused
   * @throws When timeout expires before pause occurs
   * @example
   * ```typescript
   * await adapter.continue();
   * const state = await adapter.waitForPause(5000);
   * console.log(`Paused at $\{state.location?.line\}`);
   * ```
   * @public
   * @see file:./pause-handler.ts:120 - Pause promise management
   */
  public async waitForPause(timeoutMs = 30000): Promise<DebugState> {
    return this.pauseHandlerManager.waitForPause(
      timeoutMs,
      this.getDebugState(),
    );
  }
}
