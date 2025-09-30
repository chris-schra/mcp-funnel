import type { ChildProcess } from 'child_process';
import type { ITypedCDPClient, DebugRequest } from '../../types/index.js';
import type { ProcessSpawner } from './process-spawner.js';

/**
 * Manages Chrome DevTools Protocol (CDP) connection setup for Node.js debugging.
 *
 * Handles both direct WebSocket connections and spawned Node.js process connections,
 * enabling Runtime and Debugger CDP domains. The connection lifecycle is split into
 * two phases: connect() for initial setup and finalizeConnection() for activation
 * after event handlers are registered.
 *
 * The two-phase connection pattern (connect → setup event handlers → finalize) ensures
 * CDP domains are enabled before event handlers are attached, preventing race conditions
 * where debugger events might be missed during initialization.
 * @example
 * ```typescript
 * const connectionManager = new ConnectionManager(cdpClient, spawner, request);
 *
 * // Phase 1: Connect and enable CDP domains
 * const process = await connectionManager.connect(target);
 *
 * // Phase 2: Register event handlers
 * eventHandlersManager.setupCDPHandlers(...);
 *
 * // Phase 3: Finalize connection and start debugging
 * await connectionManager.finalizeConnection();
 * ```
 * @see file:./process-spawner.ts:49 - ProcessSpawner implementation
 * @see file:../node-adapter.ts:100-114 - Usage in NodeDebugAdapter.connect
 * @internal
 */
export class ConnectionManager {
  /**
   * @param {ITypedCDPClient} cdpClient - CDP client for protocol communication
   * @param {ProcessSpawner} spawner - Process spawner for launching Node.js with inspector
   * @param {DebugRequest} [request] - Optional debug request with configuration (command, args, stopOnEntry)
   */
  public constructor(
    private cdpClient: ITypedCDPClient,
    private spawner: ProcessSpawner,
    private request?: DebugRequest,
  ) {}

  /**
   * Establishes connection to debug target and enables CDP domains.
   *
   * Handles two connection modes:
   * 1. Direct WebSocket connection when target starts with 'ws://'
   * 2. Spawned Node.js process connection for script file paths
   *
   * After connecting, enables Runtime and Debugger CDP domains required for
   * debugging operations. Event handlers must be registered before calling finalizeConnection().
   * @param {string} target - WebSocket URL (ws://...) or script file path to debug
   * @returns {Promise<ChildProcess | undefined>} Promise resolving to spawned ChildProcess (if spawned) or undefined (if direct WebSocket)
   * @throws {Error} When CDP connection fails
   * @throws {Error} When process spawning fails (for script file targets)
   * @throws {Error} When CDP domain enablement fails
   * @see file:./process-spawner.ts:56-59 - ProcessSpawner.spawn method
   * @see file:../node-adapter.ts:103 - Call site in NodeDebugAdapter
   */
  public async connect(target: string): Promise<ChildProcess | undefined> {
    let process: ChildProcess | undefined;

    // If target is a WebSocket URL, connect directly
    if (target.startsWith('ws://')) {
      await this.cdpClient.connect(target);
    } else {
      process = await this.connectToSpawnedProcess(target);
    }

    // Enable necessary CDP domains FIRST - must be done before event handlers
    console.debug('[NodeDebugAdapter] Enabling Runtime...');
    await this.cdpClient.send('Runtime.enable');
    console.debug('[NodeDebugAdapter] Enabling Debugger...');
    await this.cdpClient.send('Debugger.enable');

    return process;
  }

  /**
   * Completes connection setup by resuming debugger execution.
   *
   * Must be called after event handlers are registered via connect().
   * Sends Runtime.runIfWaitingForDebugger to resume the paused Node.js process,
   * triggering the initial pause event if stopOnEntry was enabled.
   *
   * This method completes the two-phase connection lifecycle. The debugger process
   * remains paused after connect() until this method releases it, ensuring
   * event handlers are ready to receive debugger events.
   * @returns {Promise<void>} Resolves when debugger has been resumed
   * @throws {Error} When CDP command fails
   * @see file:../node-adapter.ts:114 - Call site after event handler setup
   */
  public async finalizeConnection(): Promise<void> {
    // FINALLY run the debugger - this should trigger the initial pause event
    console.debug('[NodeDebugAdapter] Running if waiting for debugger...');
    await this.cdpClient.send('Runtime.runIfWaitingForDebugger');
    console.info('[NodeDebugAdapter] CDP setup complete');
  }

  /**
   * Spawns a Node.js process with inspector enabled and connects to its CDP endpoint.
   *
   * Handles special command transformations (e.g., tsx → node with --import tsx)
   * and merges request args with runtime args before spawning. Always uses 'node'
   * as the runtime command regardless of request.command configuration.
   * @param {string} target - Script file path to execute
   * @returns {Promise<ChildProcess>} Promise resolving to spawned ChildProcess
   * @throws {Error} When process spawning fails
   * @throws {Error} When CDP connection to spawned process fails
   * @see file:./process-spawner.ts:56-59 - ProcessSpawner.spawn method
   * @see file:../../types/request.ts:1-17 - DebugRequest interface
   */
  private async connectToSpawnedProcess(target: string): Promise<ChildProcess> {
    // Build args
    const args: string[] = [];

    // If tsx command was requested, add --import tsx (unless already in args)
    if (this.request?.command === 'tsx') {
      const hasImportTsx =
        this.request?.args?.includes('--import') &&
        this.request?.args?.includes('tsx');
      if (!hasImportTsx) {
        args.push('--import', 'tsx');
      }
    }

    // Add any additional args from request
    if (this.request?.args) {
      args.push(...this.request.args);
    }

    // Spawn with random port (0)
    const spawnResult = await this.spawner.spawn(target, {
      stopOnEntry: this.request?.stopOnEntry ?? true,
      command: 'node', // ALWAYS use node
      args,
      env: process.env as Record<string, string>,
      port: 0, // Use random port
    });

    // Connect to the WebSocket URL returned by spawner
    console.info(
      '[NodeDebugAdapter] Connecting to WebSocket URL:',
      spawnResult.wsUrl,
    );
    await this.cdpClient.connect(spawnResult.wsUrl);

    return spawnResult.process;
  }
}
