import { vi } from 'vitest';
import type {
  DebugSessionConfig,
  DebugSessionDescriptor,
  DebugSessionSnapshot,
  StartDebugSessionResponse,
} from '../../src/types/index.js';

/**
 * Creates the mock session object used by vi.mock.
 * Use this in your vi.mock('../src/debugger/session.js') call.
 * @returns A mock session instance with stubbed methods
 */
export function createMockSessionInstance() {
  const mockSession = {
    id: '',
    initialize: vi.fn(),
    getDescriptor: vi.fn(),
    getSnapshot: vi.fn(),
    runCommand: vi.fn(),
    queryOutput: vi.fn(),
    getScopeVariables: vi.fn(),
    onTerminated: vi.fn(),
  };

  return {
    DebuggerSession: vi.fn(function (
      this: typeof mockSession,
      id: string,
      _config: DebugSessionConfig,
    ) {
      this.id = id;
      this.initialize = mockSession.initialize;
      this.getDescriptor = mockSession.getDescriptor;
      this.getSnapshot = mockSession.getSnapshot;
      this.runCommand = mockSession.runCommand;
      this.queryOutput = mockSession.queryOutput;
      this.getScopeVariables = mockSession.getScopeVariables;
      this.onTerminated = mockSession.onTerminated;
      return this;
    }),
  };
}

/**
 * Factory for creating mock debug session configs.
 * @param id - Optional session ID
 * @returns A mock debug session config
 */
export const createMockConfig = (id?: string): DebugSessionConfig => ({
  id,
  target: {
    type: 'node',
    entry: '/test/entry.js',
    cwd: '/test',
  },
});

/**
 * Factory for creating mock debug session descriptors.
 * @param sessionId - The session ID for the descriptor
 * @returns A mock debug session descriptor
 */
export const createMockDescriptor = (
  sessionId: string,
): DebugSessionDescriptor => ({
  id: sessionId,
  target: {
    type: 'node',
    entry: '/test/entry.js',
    cwd: '/test',
  },
  state: { status: 'running' },
  createdAt: Date.now(),
  updatedAt: Date.now(),
});

/**
 * Factory for creating mock debug session snapshots.
 * @param sessionId - The session ID for the snapshot
 * @returns A mock debug session snapshot
 */
export const createMockSnapshot = (
  sessionId: string,
): DebugSessionSnapshot => ({
  session: createMockDescriptor(sessionId),
  output: {
    stdio: [],
    console: [],
    exceptions: [],
  },
});

/**
 * Factory for creating mock start debug session responses.
 * @param sessionId - The session ID for the response
 * @returns A mock start debug session response
 */
export const createMockStartResponse = (
  sessionId: string,
): StartDebugSessionResponse => ({
  session: createMockDescriptor(sessionId),
});
