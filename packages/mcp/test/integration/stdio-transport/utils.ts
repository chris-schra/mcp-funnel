import type { ChildProcess } from 'child_process';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ReconnectablePrefixedStdioClientTransport } from '../../../src/proxy/transports/reconnectable-transport.js';

/**
 * Tracked resources for cleanup
 */
interface TransportTestResources {
  transport?: ReconnectablePrefixedStdioClientTransport;
  client?: Client;
  additionalProcesses?: ChildProcess[];
}

/**
 * Creates a cleanup function that safely disposes of transport test resources.
 * Prevents resource leaks and double-cleanup.
 * @param resources - Resources to track for cleanup
 * @returns Cleanup function
 */
export function createCleanup(resources: TransportTestResources) {
  let cleanupCalled = false;

  return async () => {
    if (cleanupCalled) return;
    cleanupCalled = true;

    // Close client first
    if (resources.client) {
      try {
        await resources.client.close();
      } catch {
        // Ignore close errors
      }
    }

    // Destroy transport
    if (resources.transport) {
      try {
        await resources.transport.destroy();
      } catch {
        // Ignore destroy errors
      }
    }

    // Kill any additional processes
    if (resources.additionalProcesses) {
      for (const proc of resources.additionalProcesses) {
        try {
          if (!proc.killed) {
            proc.kill('SIGTERM');
          }
        } catch {
          // Ignore kill errors
        }
      }
    }
  };
}

/**
 * Wait for a condition with timeout.
 * @param condition - Function that returns true when condition is met, null to continue waiting
 * @param options - Wait options
 * @returns The truthy value returned by condition
 * @throws Error if timeout is reached
 */
export async function waitFor<T>(
  condition: () => T | null,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<T> {
  const { timeoutMs = 5000, intervalMs = 50 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const result = condition();
    if (result !== null) {
      return result;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`Timeout after ${timeoutMs}ms waiting for condition`);
}

/**
 * Wait for transport to reach a specific connection state.
 * @param transport - Transport to monitor
 * @param targetState - Target connection state
 * @param timeoutMs - Maximum wait time
 */
export async function waitForState(
  transport: ReconnectablePrefixedStdioClientTransport,
  targetState: string,
  timeoutMs = 5000,
): Promise<void> {
  await waitFor(
    () => {
      return transport.connectionState === targetState ? true : null;
    },
    { timeoutMs },
  );
}

/**
 * Wait for reconnection to complete (state becomes 'connected' after being disconnected).
 * @param transport - Transport to monitor
 * @param timeoutMs - Maximum wait time
 */
export async function waitForReconnection(
  transport: ReconnectablePrefixedStdioClientTransport,
  timeoutMs = 10000,
): Promise<void> {
  await waitForState(transport, 'connected', timeoutMs);
}

/**
 * Get the underlying process from a transport (for testing purposes).
 * @param transport - Transport instance
 * @returns Underlying child process
 */
export function getTransportProcess(
  transport: ReconnectablePrefixedStdioClientTransport,
): ChildProcess {
  // Access private property for testing
  return (transport as unknown as { process: ChildProcess }).process;
}

/**
 * Kill the transport's underlying process to simulate a crash.
 * @param transport - Transport to kill
 * @param signal - Signal to send (default: SIGKILL for immediate termination)
 */
export function simulateCrash(
  transport: ReconnectablePrefixedStdioClientTransport,
  signal: NodeJS.Signals = 'SIGKILL',
): void {
  const process = getTransportProcess(transport);
  process.kill(signal);
}

/**
 * Standard test server configuration for mcp-server-time.
 */
export const TEST_SERVER_CONFIG = {
  command: 'uvx',
  args: ['mcp-server-time'],
  serverName: 'time-test',
} as const;

/**
 * Standard reconnection config for tests (fast retries).
 */
export const TEST_RECONNECTION_CONFIG = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 500,
  backoffMultiplier: 2,
} as const;

/**
 * Verifies that a transport can successfully call a tool.
 * @param client - MCP client connected to transport
 * @returns True if tool call succeeded
 */
export async function verifyToolCall(client: Client): Promise<boolean> {
  try {
    const result = await client.callTool({
      name: 'get_current_time',
      arguments: {},
    });

    if (!Array.isArray(result.content) || result.content.length === 0) {
      return false;
    }

    const firstItem = result.content[0];
    return (
      firstItem !== null &&
      typeof firstItem === 'object' &&
      'type' in firstItem &&
      firstItem.type === 'text' &&
      'text' in firstItem &&
      typeof firstItem.text === 'string'
    );
  } catch {
    return false;
  }
}

/**
 * Verifies that tools can be listed from the server.
 * @param client - MCP client connected to transport
 * @returns Array of tool names
 */
export async function listServerTools(client: Client): Promise<string[]> {
  const result = await client.listTools();
  return result.tools.map((t) => t.name);
}
