import { waitFor } from './async-helpers.js';
import type {
  DebugSessionId,
  OutputQueryResult,
  ConsoleLevel,
  StreamName,
} from '../../src/types/index.js';
import type { DebuggerSessionManager } from '../../src/debugger/session-manager.js';

/**
 * Waits for query result matching optional condition.
 *
 * @param queryFn - Function that executes the query
 * @param options - Optional condition and timeout
 * @returns Query result when condition is met
 */
export async function waitForOutput(
  queryFn: () => Promise<OutputQueryResult>,
  options: {
    condition?: (result: OutputQueryResult) => boolean;
    timeoutMs?: number;
  } = {},
): Promise<OutputQueryResult> {
  const { condition, timeoutMs = 5000 } = options;
  const defaultCondition = (result: OutputQueryResult) => result.entries.length > 0;
  const checkCondition = condition ?? defaultCondition;

  return waitFor(
    async () => {
      const result = await queryFn();
      return checkCondition(result) ? result : null;
    },
    { timeoutMs, intervalMs: 50 },
  );
}

/**
 * Queries output for a specific console level.
 *
 * @param manager - Session manager instance
 * @param sessionId - Session identifier
 * @param level - Console level to query
 * @returns Query result containing console entries
 */
export async function queryWithConsoleLevel(
  manager: DebuggerSessionManager,
  sessionId: DebugSessionId,
  level: ConsoleLevel,
): Promise<OutputQueryResult> {
  return waitForOutput(
    () =>
      manager.queryOutput({
        sessionId,
        levels: [level],
        includeExceptions: false,
      }),
    {
      condition: (r) => r.entries.some((e) => e.kind === 'console' && e.entry.level === level),
      timeoutMs: 5000,
    },
  );
}

/**
 * Queries output for a specific stream.
 *
 * @param manager - Session manager instance
 * @param sessionId - Session identifier
 * @param stream - Stream name to query
 * @returns Query result containing stdio entries
 */
export async function queryWithStream(
  manager: DebuggerSessionManager,
  sessionId: DebugSessionId,
  stream: StreamName,
): Promise<OutputQueryResult> {
  return waitForOutput(() =>
    manager.queryOutput({
      sessionId,
      streams: [stream],
      includeExceptions: false,
    }),
  );
}
