import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import type { DebuggerSession } from '../src/debugger/session.js';
import type {
  DebugSessionConfig,
  DebuggerCommand,
  OutputQuery,
  ScopeQuery,
} from '../src/types/index.js';
import { createMockConfig, createMockStartResponse } from './utils/mock-helpers.js';

// Mock DebuggerSession to avoid spawning real processes
vi.mock('../src/debugger/session.js', () => {
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
});

describe('DebuggerSessionManager - Error Handling', () => {
  let manager: DebuggerSessionManager;
  let mockSessionInstance: DebuggerSession;

  beforeEach(async () => {
    manager = new DebuggerSessionManager();

    const { DebuggerSession } = vi.mocked(await import('../src/debugger/session.js'));
    mockSessionInstance = new DebuggerSession('test-id', createMockConfig()) as DebuggerSession;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('error handling', () => {
    it('should handle session initialization timeout', async () => {
      const config = createMockConfig();
      const error = new Error('Timed out waiting for inspector URL');

      vi.mocked(mockSessionInstance.initialize).mockRejectedValueOnce(error);

      await expect(manager.startSession(config)).rejects.toThrow(
        'Timed out waiting for inspector URL',
      );
    });

    it('should handle command execution errors', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      const command: DebuggerCommand = {
        sessionId,
        action: 'continue',
      };
      const error = new Error('Command execution failed');

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(mockResponse);
      vi.mocked(mockSessionInstance.runCommand).mockRejectedValueOnce(error);

      await manager.startSession(config);

      await expect(manager.runCommand(command)).rejects.toThrow('Command execution failed');
    });

    it('should handle output query errors', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      const query: OutputQuery = { sessionId };
      const error = new Error('Query failed');

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(mockResponse);
      vi.mocked(mockSessionInstance.queryOutput).mockRejectedValueOnce(error);

      await manager.startSession(config);

      await expect(manager.queryOutput(query)).rejects.toThrow('Query failed');
    });

    it('should handle scope query errors', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      const query: ScopeQuery = {
        sessionId,
        callFrameId: 'frame-0',
        scopeNumber: 0,
      };
      const error = new Error('Scope query failed');

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(mockResponse);
      vi.mocked(mockSessionInstance.getScopeVariables).mockRejectedValueOnce(error);

      await manager.startSession(config);

      await expect(manager.getScopeVariables(query)).rejects.toThrow('Scope query failed');
    });
  });
});
