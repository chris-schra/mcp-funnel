import type { ChildProcess } from 'child_process';
import type Emittery from 'emittery';
import type { DebugState, DebugSessionEvents } from '../../types/index.js';
import type { ProcessSpawner } from './process-spawner.js';
import type { ConnectionManager } from './connection-manager.js';
import type { EventHandlersManager } from './event-handlers.js';
import type { PauseHandlerManager } from './pause-handler.js';
import type { BreakpointManager } from './breakpoint-manager.js';
import type { SourceMapHandler } from './source-map-handler.js';
import type { LegacyCallbackStorage } from './legacy-callbacks.js';

/**
 * Manages the lifecycle of a debug session (connect, disconnect, cleanup).
 *
 * Coordinates between connection manager, event handlers, and various cleanup
 * operations to ensure proper session initialization and teardown.
 * @public
 * @see file:../node-adapter.ts:199 - Usage in NodeDebugAdapter
 */
export class SessionLifecycleManager {
  /**
   * Creates a session lifecycle manager instance.
   * @param connectionManager - Manages CDP connection and process spawning
   * @param eventHandlersManager - Sets up CDP event handlers
   * @param pauseHandlerManager - Manages pause promises
   * @param breakpointManager - Manages breakpoints
   * @param spawner - Process spawner for killing child processes
   * @param sourceMapHandler - Source map handler for cleanup
   * @param eventEmitter - Event emitter for session events
   * @param legacyCallbacks - Storage for legacy callback handlers
   * @param getDebugState - Function to get current debug state
   * @param setDebugState - Function to update debug state
   * @param getCdpClient - Function to get CDP client
   * @param getScriptIdToUrl - Function to get script ID to URL map
   * @param setProcess - Function to set the spawned process
   * @param getProcess - Function to get the spawned process
   * @param clearSessionState - Function to clear session-specific state
   */
  public constructor(
    private readonly connectionManager: ConnectionManager,
    private readonly eventHandlersManager: EventHandlersManager,
    private readonly pauseHandlerManager: PauseHandlerManager,
    private readonly breakpointManager: BreakpointManager,
    private readonly spawner: ProcessSpawner,
    private readonly sourceMapHandler: SourceMapHandler,
    private readonly eventEmitter: Emittery<DebugSessionEvents>,
    private readonly legacyCallbacks: LegacyCallbackStorage,
    private readonly getDebugState: () => DebugState,
    private readonly setDebugState: (state: DebugState) => void,
    private readonly getCdpClient: () => { disconnect: () => Promise<void> },
    private readonly getScriptIdToUrl: () => Map<string, string>,
    private readonly setProcess: (process: ChildProcess | undefined) => void,
    private readonly getProcess: () => ChildProcess | undefined,
    private readonly clearSessionState: () => void,
  ) {}

  /**
   * Connects to the Node.js debugger and initializes the debug session.
   *
   * This method performs the following steps:
   * 1. Spawns the Node.js process with inspector flags
   * 2. Establishes WebSocket connection to the CDP endpoint
   * 3. Enables CDP domains (Debugger, Runtime, etc.)
   * 4. Sets up event handlers for pause, resume, console, etc.
   * 5. Transitions state to 'running'
   *
   * The connection process is managed by ConnectionManager and EventHandlersManager
   * to ensure proper initialization order and error handling.
   * @param target - Path to the script to debug (e.g., '/path/to/script.js')
   * @throws When connection fails or process cannot be spawned
   * @example
   * ```typescript
   * await adapter.connect('./dist/index.js');
   * // Session is now active and will pause at entry or first breakpoint
   * ```
   * @public
   * @see file:./connection-manager.ts:25 - ConnectionManager implementation
   * @see file:./event-handlers.ts:50 - Event handler setup
   */
  public async connect(target: string): Promise<void> {
    try {
      // Connect and setup CDP domains
      const process = await this.connectionManager.connect(target);
      this.setProcess(process);

      // THEN setup CDP event handlers before running the debugger
      this.eventHandlersManager.setupCDPHandlers(
        this.legacyCallbacks.getConsoleHandler(),
        this.legacyCallbacks.getResumeHandler(),
        this.legacyCallbacks.getBreakpointResolvedHandler(),
        this.legacyCallbacks.getPauseHandler(),
      );

      // Finalize the connection
      await this.connectionManager.finalizeConnection();

      // Initial state is running until we get a pause event
      this.setDebugState({ status: 'running' });
    } catch (error) {
      const adapterError =
        error instanceof Error ? error : new Error(String(error));
      this.eventEmitter.emit('error', adapterError);
      throw adapterError;
    }
  }

  /**
   * Disconnects from the debug session and cleans up all resources.
   *
   * This method performs complete teardown:
   * 1. Rejects any pending pause promises with termination error
   * 2. Disconnects CDP client and closes WebSocket
   * 3. Terminates the spawned Node.js process
   * 4. Clears all breakpoints and internal state
   * 5. Destroys source map handler
   * 6. Emits 'terminated' event for listeners
   *
   * Safe to call multiple times - subsequent calls are no-ops.
   * @throws Errors during cleanup are logged but not thrown to ensure cleanup completes
   * @example
   * ```typescript
   * try {
   *   await adapter.disconnect();
   * } finally {
   *   // Session is fully cleaned up
   * }
   * ```
   * @public
   * @see file:./pause-handler.ts:80 - Pause promise rejection
   */
  public async disconnect(): Promise<void> {
    // Reject any pending pause promises
    const terminationError = new Error('Debug session terminated');
    this.pauseHandlerManager.rejectPendingPromises(terminationError);

    await this.getCdpClient().disconnect();

    const process = this.getProcess();
    if (process) {
      await this.spawner.kill(process);
      this.setProcess(undefined);
    }

    this.setDebugState({ status: 'terminated' });
    this.breakpointManager.clearAll();
    this.getScriptIdToUrl().clear();
    this.clearSessionState();

    // Cleanup source map handler
    this.sourceMapHandler.destroy();

    // Emit terminated event (fire and forget)
    this.eventEmitter.emit('terminated', undefined).catch((error) => {
      console.error(
        '[NodeDebugAdapter] Error emitting terminated event:',
        error,
      );
    });
  }
}
