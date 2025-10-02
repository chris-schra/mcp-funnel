import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JsDebuggerCommand } from '../src/index.js';
import type {
  DebugSessionConfig,
  StartDebugSessionResponse,
  DebuggerCommand as DebuggerCommandType,
  DebuggerCommandResult,
  ScopeQuery,
  ScopeQueryResult,
  OutputQuery,
  OutputQueryResult,
} from '../src/types/index.js';

describe('JsDebuggerCommand - MCP Interface', () => {
  let command: JsDebuggerCommand;
  let mockManager: {
    startSession: ReturnType<typeof vi.fn>;
    runCommand: ReturnType<typeof vi.fn>;
    getScopeVariables: ReturnType<typeof vi.fn>;
    queryOutput: ReturnType<typeof vi.fn>;
  };

  const mockSession = (): StartDebugSessionResponse => ({
    session: {
      id: 'test-id',
      status: 'running',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      target: { type: 'node', entry: './test.js' },
      inspector: { url: 'ws://localhost:9229', host: 'localhost', port: 9229 },
    },
  });

  const mockCommand = (): DebuggerCommandResult => ({
    session: {
      id: 'test-id',
      status: 'paused',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      target: { type: 'node', entry: './test.js' },
    },
    pause: {
      reason: 'debugCommand',
      callFrames: [
        {
          callFrameId: 'frame-1',
          functionName: 'test',
          location: { scriptId: 'script-1', lineNumber: 10, columnNumber: 5 },
          url: 'file:///test.js',
          this: { type: 'object', preview: 'Object' },
          scopeChain: [
            { type: 'local', object: { type: 'object', objectId: 'scope-1' } },
          ],
        },
      ],
    },
  });

  const mockScope = (): ScopeQueryResult => ({
    path: [],
    truncated: false,
    variables: [
      { name: 'x', value: { type: 'number', value: 42, preview: '42' } },
    ],
  });

  const mockOutput = (): OutputQueryResult => ({
    entries: [
      {
        kind: 'console',
        cursor: 1,
        entry: {
          level: 'log',
          origin: 'console',
          text: 'Test log',
          arguments: [],
          timestamp: Date.now(),
        },
      },
    ],
    nextCursor: 2,
    hasMore: false,
  });

  beforeEach(() => {
    command = new JsDebuggerCommand();
    mockManager = {
      startSession: vi.fn(),
      runCommand: vi.fn(),
      getScopeVariables: vi.fn(),
      queryOutput: vi.fn(),
    };
    (command as unknown as { manager: typeof mockManager }).manager =
      mockManager;
  });

  describe('getMCPDefinitions', () => {
    it('returns all tool definitions with correct structure', () => {
      const defs = command.getMCPDefinitions();

      expect(defs).toHaveLength(4);
      expect(defs.map((d) => d.name)).toEqual([
        'js-debugger_startDebugSession',
        'js-debugger_debuggerCommand',
        'js-debugger_getScopeVariables',
        'js-debugger_queryOutput',
      ]);

      defs.forEach((def) => {
        expect(def.description).toBeDefined();
        expect(def.inputSchema.type).toBe('object');
      });
    });

    it('includes required schema properties', () => {
      const defs = command.getMCPDefinitions();

      expect(
        defs.find((d) => d.name === 'js-debugger_startDebugSession')
          ?.inputSchema.properties,
      ).toHaveProperty('target');
      expect(
        defs.find((d) => d.name === 'js-debugger_debuggerCommand')?.inputSchema
          .properties,
      ).toHaveProperty('action');
      expect(
        defs.find((d) => d.name === 'js-debugger_getScopeVariables')
          ?.inputSchema.properties,
      ).toHaveProperty('callFrameId');
      expect(
        defs.find((d) => d.name === 'js-debugger_queryOutput')?.inputSchema
          .properties,
      ).toHaveProperty('sessionId');
    });
  });

  describe('executeToolViaMCP - startDebugSession', () => {
    const cfg = {
      target: { type: 'node', entry: './test.js', entryArguments: ['arg1'] },
    };

    it('handles prefixed and unprefixed tool names', async () => {
      mockManager.startSession.mockResolvedValue(mockSession());

      const r1 = await command.executeToolViaMCP(
        'js-debugger_startDebugSession',
        cfg,
      );
      expect(r1.isError).toBeFalsy();

      vi.clearAllMocks();
      mockManager.startSession.mockResolvedValue(mockSession());

      const r2 = await command.executeToolViaMCP('startDebugSession', cfg);
      expect(r2.isError).toBeFalsy();
    });

    it('returns JSON response with session data', async () => {
      const mock = mockSession();
      mockManager.startSession.mockResolvedValue(mock);

      const result = await command.executeToolViaMCP('startDebugSession', cfg);

      expect(result.content[0].text).toBe(JSON.stringify(mock, null, 2));
      const passed = mockManager.startSession.mock
        .calls[0][0] as DebugSessionConfig;
      expect(passed.target.entry).toBe('./test.js');
    });

    it('handles errors', async () => {
      mockManager.startSession.mockRejectedValue(new Error('Failed'));

      const result = await command.executeToolViaMCP('startDebugSession', cfg);

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Failed');
    });
  });

  describe('executeToolViaMCP - debuggerCommand', () => {
    it('executes all command types', async () => {
      const actions = ['continue', 'pause', 'stepInto', 'stepOver', 'stepOut'];

      for (const action of actions) {
        vi.clearAllMocks();
        mockManager.runCommand.mockResolvedValue(mockCommand());

        const r = await command.executeToolViaMCP('debuggerCommand', {
          sessionId: 'test',
          action,
        });

        expect(r.isError).toBeFalsy();
        expect(
          (mockManager.runCommand.mock.calls[0][0] as DebuggerCommandType)
            .action,
        ).toBe(action);
      }
    });

    it('handles continueToLocation', async () => {
      mockManager.runCommand.mockResolvedValue(mockCommand());

      const r = await command.executeToolViaMCP('debuggerCommand', {
        sessionId: 'test',
        action: 'continueToLocation',
        location: { lineNumber: 10, url: './test.js' },
      });

      expect(r.isError).toBeFalsy();
    });

    it('returns JSON and handles errors', async () => {
      const mock = mockCommand();
      mockManager.runCommand.mockResolvedValue(mock);

      const r1 = await command.executeToolViaMCP('debuggerCommand', {
        sessionId: 'test',
        action: 'continue',
      });
      expect(r1.content[0].text).toBe(JSON.stringify(mock, null, 2));

      mockManager.runCommand.mockRejectedValue(new Error('Not found'));

      const r2 = await command.executeToolViaMCP('debuggerCommand', {
        sessionId: 'test',
        action: 'continue',
      });
      expect(r2.isError).toBe(true);
      expect(r2.content[0].text).toContain('Not found');
    });
  });

  describe('executeToolViaMCP - getScopeVariables', () => {
    const query = {
      sessionId: 'test',
      callFrameId: 'frame-1',
      scopeNumber: 0,
    };

    it('queries with optional parameters', async () => {
      mockManager.getScopeVariables.mockResolvedValue(mockScope());

      await command.executeToolViaMCP('getScopeVariables', {
        ...query,
        depth: 2,
        maxProperties: 50,
        path: [{ property: 'obj' }],
      });

      const passed = mockManager.getScopeVariables.mock
        .calls[0][0] as ScopeQuery;
      expect(passed.depth).toBe(2);
      expect(passed.maxProperties).toBe(50);
      expect(passed.path).toHaveLength(1);
    });

    it('returns JSON and handles errors', async () => {
      const mock = mockScope();
      mockManager.getScopeVariables.mockResolvedValue(mock);

      const r1 = await command.executeToolViaMCP('getScopeVariables', query);
      expect(r1.content[0].text).toBe(JSON.stringify(mock, null, 2));

      mockManager.getScopeVariables.mockRejectedValue(
        new Error('Invalid frame'),
      );

      const r2 = await command.executeToolViaMCP('getScopeVariables', query);
      expect(r2.isError).toBe(true);
      expect(r2.content[0].text).toContain('Invalid frame');
    });
  });

  describe('executeToolViaMCP - queryOutput', () => {
    const query = { sessionId: 'test' };

    it('queries with all filter parameters', async () => {
      mockManager.queryOutput.mockResolvedValue(mockOutput());

      await command.executeToolViaMCP('queryOutput', {
        ...query,
        since: 100,
        limit: 50,
        streams: ['stdout'],
        levels: ['error'],
        search: 'test',
      });

      const passed = mockManager.queryOutput.mock.calls[0][0] as OutputQuery;
      expect(passed.since).toBe(100);
      expect(passed.limit).toBe(50);
      expect(passed.streams).toEqual(['stdout']);
      expect(passed.levels).toEqual(['error']);
      expect(passed.search).toBe('test');
    });

    it('returns JSON and handles errors', async () => {
      const mock = mockOutput();
      mockManager.queryOutput.mockResolvedValue(mock);

      const r1 = await command.executeToolViaMCP('queryOutput', query);
      expect(r1.content[0].text).toBe(JSON.stringify(mock, null, 2));

      mockManager.queryOutput.mockRejectedValue(new Error('Terminated'));

      const r2 = await command.executeToolViaMCP('queryOutput', query);
      expect(r2.isError).toBe(true);
      expect(r2.content[0].text).toContain('Terminated');
    });
  });

  describe('Error handling', () => {
    it('handles unknown tools', async () => {
      const r = await command.executeToolViaMCP('unknown', {});
      expect(r.isError).toBe(true);
      expect(r.content[0].text).toContain('Unknown tool');
    });

    it('handles invalid arguments', async () => {
      const r1 = await command.executeToolViaMCP('startDebugSession', {
        invalid: 'data',
      });
      expect(r1.isError).toBe(true);

      const r2 = await command.executeToolViaMCP('debuggerCommand', {});
      expect(r2.isError).toBe(true);
    });

    it('handles non-Error exceptions', async () => {
      mockManager.startSession.mockRejectedValue('String error');

      const r = await command.executeToolViaMCP('startDebugSession', {
        target: { type: 'node', entry: './test.js' },
      });

      expect(r.isError).toBe(true);
      expect(r.content[0].text).toBe('String error');
    });
  });

  describe('Type safety', () => {
    it('enforces TypeScript types', async () => {
      mockManager.startSession.mockImplementation(
        async (cfg: DebugSessionConfig) => {
          expect(cfg.target.type).toBe('node');
          return mockSession();
        },
      );

      const r = await command.executeToolViaMCP('startDebugSession', {
        target: { type: 'node', entry: './test.js' },
      });

      expect(r).toHaveProperty('content');
      expect(Array.isArray(r.content)).toBe(true);
    });
  });
});
