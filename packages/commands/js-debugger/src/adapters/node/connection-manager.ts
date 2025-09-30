import type { ChildProcess } from 'child_process';
import type { ITypedCDPClient, DebugRequest } from '../../types/index.js';
import type { ProcessSpawner } from './process-spawner.js';

/**
 * Manages connection setup for Node.js debugging
 */
export class ConnectionManager {
  constructor(
    private cdpClient: ITypedCDPClient,
    private spawner: ProcessSpawner,
    private request?: DebugRequest,
  ) {}

  /**
   * Connect to the debug target and setup CDP
   */
  async connect(target: string): Promise<ChildProcess | undefined> {
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
   * Complete the connection setup after event handlers are ready
   */
  async finalizeConnection(): Promise<void> {
    // FINALLY run the debugger - this should trigger the initial pause event
    console.debug('[NodeDebugAdapter] Running if waiting for debugger...');
    await this.cdpClient.send('Runtime.runIfWaitingForDebugger');
    console.info('[NodeDebugAdapter] CDP setup complete');
  }

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
