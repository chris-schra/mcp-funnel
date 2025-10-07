import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DebuggerSessionManager } from '../src/debugger/session-manager.js';
import type { DebuggerSession } from '../src/debugger/session.js';
import type { DebugSessionConfig } from '../src/types/index.js';
import {
  createMockConfig,
  createMockDescriptor,
  createMockSnapshot,
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

describe('DebuggerSessionManager - Lifecycle', () => {
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

  describe('startSession', () => {
    it('should start a new session with auto-generated ID', async () => {
      const config = createMockConfig();
      const sessionId = 'generated-id';
      const mockResponse = createMockStartResponse(sessionId);

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );

      const result = await manager.startSession(config);

      expect(result).toBeDefined();
      expect(result.session).toBeDefined();
      expect(mockSessionInstance.initialize).toHaveBeenCalledTimes(1);
    });

    it('should start a new session with provided ID', async () => {
      const sessionId = 'custom-session-id';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );

      const result = await manager.startSession(config);

      expect(result.session.id).toBe(sessionId);
      expect(mockSessionInstance.initialize).toHaveBeenCalledTimes(1);
    });

    it('should throw error when session ID already exists', async () => {
      const sessionId = 'duplicate-id';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);

      vi.mocked(mockSessionInstance.initialize).mockResolvedValue(mockResponse);

      await manager.startSession(config);

      await expect(manager.startSession(config)).rejects.toThrow(
        `Session with id ${sessionId} already exists.`,
      );
    });

    it('should clean up session on initialization failure', async () => {
      const config = createMockConfig();
      const error = new Error('Initialization failed');

      vi.mocked(mockSessionInstance.initialize).mockRejectedValueOnce(error);

      await expect(manager.startSession(config)).rejects.toThrow(
        'Initialization failed',
      );

      const sessionId = mockSessionInstance.id;
      expect(() => manager.getDescriptor(sessionId)).toThrow(
        `Debugger session ${sessionId} not found.`,
      );
    });

    it('should register termination handler for session cleanup', async () => {
      const config = createMockConfig('test-id');
      const mockResponse = createMockStartResponse('test-id');
      let terminationHandler:
        | ((value: {
            code: number | null;
            signal?: NodeJS.Signals | null;
          }) => void)
        | undefined;

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );
      vi.mocked(mockSessionInstance.onTerminated).mockImplementation(
        (handler) => {
          terminationHandler = handler;
          return () => {};
        },
      );

      await manager.startSession(config);

      expect(mockSessionInstance.onTerminated).toHaveBeenCalledTimes(1);
      expect(terminationHandler).toBeDefined();

      terminationHandler?.({ code: 0, signal: null });

      expect(() => manager.getDescriptor('test-id')).toThrow(
        'Debugger session test-id not found.',
      );
    });
  });

  describe('getDescriptor', () => {
    it('should return session descriptor for existing session', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      const mockDescriptor = createMockDescriptor(sessionId);

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );
      vi.mocked(mockSessionInstance.getDescriptor).mockReturnValue(
        mockDescriptor,
      );

      await manager.startSession(config);
      const descriptor = manager.getDescriptor(sessionId);

      expect(descriptor).toEqual(mockDescriptor);
      expect(mockSessionInstance.getDescriptor).toHaveBeenCalledTimes(1);
    });

    it('should throw error when session not found', () => {
      const sessionId = 'non-existent-id';

      expect(() => manager.getDescriptor(sessionId)).toThrow(
        `Debugger session ${sessionId} not found.`,
      );
    });
  });

  describe('getSnapshot', () => {
    it('should return session snapshot for existing session', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      const mockSnapshot = createMockSnapshot(sessionId);

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );
      vi.mocked(mockSessionInstance.getSnapshot).mockReturnValue(mockSnapshot);

      await manager.startSession(config);
      const snapshot = manager.getSnapshot(sessionId);

      expect(snapshot).toEqual(mockSnapshot);
      expect(mockSessionInstance.getSnapshot).toHaveBeenCalledTimes(1);
    });

    it('should throw error when session not found', () => {
      const sessionId = 'non-existent-id';

      expect(() => manager.getSnapshot(sessionId)).toThrow(
        `Debugger session ${sessionId} not found.`,
      );
    });
  });

  describe('session lifecycle and cleanup', () => {
    it('should remove session when terminated', async () => {
      const sessionId = 'test-session';
      const config = createMockConfig(sessionId);
      const mockResponse = createMockStartResponse(sessionId);
      let terminationHandler:
        | ((value: {
            code: number | null;
            signal?: NodeJS.Signals | null;
          }) => void)
        | undefined;

      vi.mocked(mockSessionInstance.initialize).mockResolvedValueOnce(
        mockResponse,
      );
      vi.mocked(mockSessionInstance.onTerminated).mockImplementation(
        (handler) => {
          terminationHandler = handler;
          return () => {};
        },
      );

      await manager.startSession(config);

      expect(manager.getDescriptor(sessionId)).toBeDefined();

      terminationHandler?.({ code: 0, signal: null });

      expect(() => manager.getDescriptor(sessionId)).toThrow(
        `Debugger session ${sessionId} not found.`,
      );
    });

    it('should handle multiple sessions independently', async () => {
      const sessionId1 = 'session-1';
      const sessionId2 = 'session-2';
      const config1 = createMockConfig(sessionId1);
      const config2 = createMockConfig(sessionId2);
      const mockResponse1 = createMockStartResponse(sessionId1);
      const mockResponse2 = createMockStartResponse(sessionId2);

      vi.mocked(mockSessionInstance.initialize)
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);

      await manager.startSession(config1);
      await manager.startSession(config2);

      expect(manager.getDescriptor(sessionId1)).toBeDefined();
      expect(manager.getDescriptor(sessionId2)).toBeDefined();
    });

    it('should maintain session isolation', async () => {
      const sessionId1 = 'session-1';
      const sessionId2 = 'session-2';
      const config1 = createMockConfig(sessionId1);
      const config2 = createMockConfig(sessionId2);
      const mockResponse1 = createMockStartResponse(sessionId1);
      const mockResponse2 = createMockStartResponse(sessionId2);
      const descriptor1 = createMockDescriptor(sessionId1);
      const descriptor2 = createMockDescriptor(sessionId2);

      vi.mocked(mockSessionInstance.initialize)
        .mockResolvedValueOnce(mockResponse1)
        .mockResolvedValueOnce(mockResponse2);
      vi.mocked(mockSessionInstance.getDescriptor)
        .mockReturnValueOnce(descriptor1)
        .mockReturnValueOnce(descriptor2);

      await manager.startSession(config1);
      await manager.startSession(config2);

      const desc1 = manager.getDescriptor(sessionId1);
      const desc2 = manager.getDescriptor(sessionId2);

      expect(desc1.id).toBe(sessionId1);
      expect(desc2.id).toBe(sessionId2);
      expect(desc1.id).not.toBe(desc2.id);
    });
  });
});
