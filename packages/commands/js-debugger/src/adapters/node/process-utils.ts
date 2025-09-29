import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import getPort from 'get-port';
import {
  validateScriptPath,
  parseInspectorUrl,
} from '../../utils/node-inspector.js';

/**
 * Spawn a Node.js process with inspector enabled
 */
export async function spawnNodeProcess(
  scriptPath: string,
  runtime: string,
): Promise<{ process: ChildProcess; port: number; url: string | null }> {
  // Validate script path first
  await validateScriptPath(scriptPath);

  // Find an available port using get-port
  const inspectorPort = await getPort({ port: 9229 });

  return new Promise((resolve, reject) => {
    // Use the runtime directly (no npx wrapper)
    const command = runtime;
    // Always use --inspect-brk to ensure we can attach debugger before script runs
    const args = [`--inspect-brk=${inspectorPort}`, path.resolve(scriptPath)];

    const nodeProcess = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    // Ensure cleanup on process exit
    const cleanup = () => {
      if (nodeProcess && !nodeProcess.killed) {
        nodeProcess.kill('SIGTERM');
      }
    };
    process.on('exit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);

    nodeProcess.on('error', (error) => {
      reject(new Error(`Failed to spawn Node.js process: ${error.message}`));
    });

    let inspectorUrl: string | null = null;
    let debuggerOutput = '';

    const handleOutput = (data: Buffer) => {
      const output = data.toString();
      debuggerOutput += output; // Collect all output for debugging
      const foundUrl = parseInspectorUrl(output);
      if (foundUrl) {
        inspectorUrl = foundUrl;
        // Give inspector a moment to fully initialize
        // tsx needs more time to transpile and start
        setTimeout(
          () =>
            resolve({
              process: nodeProcess,
              port: inspectorPort,
              url: foundUrl,
            }),
          500,
        );
      }
    };

    nodeProcess.stdout?.on('data', handleOutput);
    nodeProcess.stderr?.on('data', handleOutput);

    nodeProcess.on('exit', (code, signal) => {
      if (!inspectorUrl) {
        reject(
          new Error(
            `Node.js process exited before inspector started (code: ${code}, signal: ${signal})\nOutput: ${debuggerOutput}`,
          ),
        );
      }
    });

    // Timeout after 30 seconds (increased for tsx which needs to transpile)
    setTimeout(() => {
      if (nodeProcess && !nodeProcess.killed && !inspectorUrl) {
        reject(
          new Error(
            `Timeout waiting for Node.js inspector to start. Output so far: ${debuggerOutput}`,
          ),
        );
      }
    }, 30000);
  });
}
