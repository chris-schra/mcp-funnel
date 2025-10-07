import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import type { DebuggerSession } from '../src/debugger/session.js';
import type {
  DebugSessionConfig,
  DebuggerCommand,
  DebuggerCommandResult,
  OutputQuery,
  OutputQueryResult,
  ScopeQuery,
  ScopeQueryResult,
} from '../src/types/index.js';
import {
  createMockConfig,
  createMockDescriptor,
  createMockStartResponse,
} from './utils/mock-helpers.js';

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

describe('DebuggerSessionManager - Commands', () => {
  let manager: DebuggerSessionManager;
  let mockSessionInstance: DebuggerSession;

  beforeEach(async () => {
    manager = new DebuggerSessionManager();

    const { DebuggerSession } = vi.mocked(
      await import('../src/debugger/session.js'),
    );
    mockSessionInstance = new DebuggerSession(
      'test-id',
      createMockConfig(),
    ) as DebuggerSession;

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('runCommand', () => {
    it('should execute debugger command on existing session', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      const command: DebuggerCommand = {
        sessionId,
        action: 'continue',
      };
      const commandResult: DebuggerCommandResult = {
        session: createMockDescriptor(sessionId),
        commandAck: { command: 'continue', sent: true },
        resumed: true,
      };

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );
      vi.mocked(mockSessionInstance.runCommand).mockResolvedValueOnce(
        commandResult,
      );

      await manager.startSession(config);
      const result = await manager.runCommand(command);

      expect(result).toEqual(commandResult);
      expect(mockSessionInstance.runCommand).toHaveBeenCalledWith(command);
    });

    it('should handle pause command', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      const command: DebuggerCommand = {
        sessionId,
        action: 'pause',
      };
      const commandResult: DebuggerCommandResult = {
        session: createMockDescriptor(sessionId),
        commandAck: { command: 'pause', sent: true },
        pause: {
          reason: 'user',
          callFrames: [],
        },
      };

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );
      vi.mocked(mockSessionInstance.runCommand).mockResolvedValueOnce(
        commandResult,
      );

      await manager.startSession(config);
      const result = await manager.runCommand(command);

      expect(result).toEqual(commandResult);
      expect(result.pause).toBeDefined();
    });

    it('should handle step commands', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      const actions: Array<'stepInto' | 'stepOver' | 'stepOut'> = [
        'stepInto',
        'stepOver',
        'stepOut',
      ];

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );

      await manager.startSession(config);

      for (const action of actions) {
        const command: DebuggerCommand = { sessionId, action };
        const commandResult: DebuggerCommandResult = {
          session: createMockDescriptor(sessionId),
          commandAck: { command: action, sent: true },
          pause: { reason: action, callFrames: [] },
        };

        vi.mocked(mockSessionInstance.runCommand).mockResolvedValueOnce(
          commandResult,
        );

        const result = await manager.runCommand(command);
        expect(result.pause).toBeDefined();
      }
    });

    it('should throw error when session not found', async () => {
      const command: DebuggerCommand = {
        sessionId: 'non-existent-id',
        action: 'continue',
      };

      await expect(manager.runCommand(command)).rejects.toThrow(
        'Debugger session non-existent-id not found.',
      );
    });
  });

  describe('queryOutput', () => {
    it('should query output from existing session', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      const query: OutputQuery = {
        sessionId,
      };
      const queryResult: OutputQueryResult = {
        entries: [],
        nextCursor: 0,
        hasMore: false,
      };

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );
      vi.mocked(mockSessionInstance.queryOutput).mockResolvedValueOnce(
        queryResult,
      );

      await manager.startSession(config);
      const result = await manager.queryOutput(query);

      expect(result).toEqual(queryResult);
      expect(mockSessionInstance.queryOutput).toHaveBeenCalledWith(query);
    });

    it('should query output with filters', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      const query: OutputQuery = {
        sessionId,
        streams: ['stdout'],
        levels: ['error'],
        limit: 10,
      };
      const queryResult: OutputQueryResult = {
        entries: [],
        nextCursor: 0,
        hasMore: false,
      };

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );
      vi.mocked(mockSessionInstance.queryOutput).mockResolvedValueOnce(
        queryResult,
      );

      await manager.startSession(config);
      const result = await manager.queryOutput(query);

      expect(result).toEqual(queryResult);
      expect(mockSessionInstance.queryOutput).toHaveBeenCalledWith(query);
    });

    it('should throw error when session not found', async () => {
      const query: OutputQuery = {
        sessionId: 'non-existent-id',
      };

      await expect(manager.queryOutput(query)).rejects.toThrow(
        'Debugger session non-existent-id not found.',
      );
    });
  });

  describe('getScopeVariables', () => {
    it('should get scope variables from existing session', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      const query: ScopeQuery = {
        sessionId,
        callFrameId: 'frame-0',
        scopeNumber: 0,
      };
      const scopeResult: ScopeQueryResult = {
        path: [],
        variables: [],
        truncated: false,
      };

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );
      vi.mocked(mockSessionInstance.getScopeVariables).mockResolvedValueOnce(
        scopeResult,
      );

      await manager.startSession(config);
      const result = await manager.getScopeVariables(query);

      expect(result).toEqual(scopeResult);
      expect(mockSessionInstance.getScopeVariables).toHaveBeenCalledWith(query);
    });

    it('should get scope variables with path', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      const query: ScopeQuery = {
        sessionId,
        callFrameId: 'frame-0',
        scopeNumber: 0,
        path: ['object', { property: 'nested' }],
      };
      const scopeResult: ScopeQueryResult = {
        path: ['object', { property: 'nested' }],
        variables: [
          {
            name: 'value',
            value: { type: 'string', preview: 'test' },
          },
        ],
        truncated: false,
      };

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );
      vi.mocked(mockSessionInstance.getScopeVariables).mockResolvedValueOnce(
        scopeResult,
      );

      await manager.startSession(config);
      const result = await manager.getScopeVariables(query);

      expect(result).toEqual(scopeResult);
      expect(result.path).toEqual(['object', { property: 'nested' }]);
    });

    it('should get scope variables with depth and maxProperties', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      const query: ScopeQuery = {
        sessionId,
        callFrameId: 'frame-0',
        scopeNumber: 0,
        depth: 3,
        maxProperties: 50,
      };
      const scopeResult: ScopeQueryResult = {
        path: [],
        variables: [],
        truncated: false,
      };

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );
      vi.mocked(mockSessionInstance.getScopeVariables).mockResolvedValueOnce(
        scopeResult,
      );

      await manager.startSession(config);
      const result = await manager.getScopeVariables(query);

      expect(result).toEqual(scopeResult);
      expect(mockSessionInstance.getScopeVariables).toHaveBeenCalledWith(query);
    });

    it('should throw error when session not found', async () => {
      const query: ScopeQuery = {
        sessionId: 'non-existent-id',
        callFrameId: 'frame-0',
        scopeNumber: 0,
      };

      await expect(manager.getScopeVariables(query)).rejects.toThrow(
        'Debugger session non-existent-id not found.',
      );
    });
  });
});
