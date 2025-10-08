import { describe, it, expect, afterAll } from 'vitest';
import { VitestCommand } from '../command.js';
import { prepareVitestFixture, type FixtureHandle } from '../../test/utils/fixture-manager.js';

describe('VitestCommand', () => {
  const commandInstances: VitestCommand[] = [];
  const fixtures: FixtureHandle[] = [];

  /**
   * Helper to track command instances for cleanup
   *
   * @returns New VitestCommand instance
   */
  function createCommand(): VitestCommand {
    const command = new VitestCommand();
    commandInstances.push(command);
    return command;
  }

  /**
   * Helper to prepare a fixture and track it for cleanup
   *
   * @param fixtureName - Name of fixture directory
   * @returns Prepared fixture handle
   */
  async function prepareFixture(fixtureName: string): Promise<FixtureHandle> {
    const fixture = await prepareVitestFixture(fixtureName);
    fixtures.push(fixture);
    return fixture;
  }

  afterAll(async () => {
    // Cleanup all command instances to prevent session leaks
    await Promise.all(commandInstances.map((cmd) => cmd['manager'].destroy()));

    // Cleanup all fixtures
    await Promise.all(fixtures.map((f) => f.cleanup()));
  });

  describe('MCP Tool Definitions', () => {
    it('should return 4 tool definitions', () => {
      const command = createCommand();
      const tools = command.getMCPDefinitions();
      expect(tools).toHaveLength(4);
      expect(tools.map((t) => t.name)).toEqual([
        'startSession',
        'getResults',
        'queryConsole',
        'getSessionStatus',
      ]);
    });

    describe('startSession tool schema', () => {
      it('should have correct structure and properties', () => {
        const command = createCommand();
        const tools = command.getMCPDefinitions();
        const tool = tools.find((t) => t.name === 'startSession')!;

        expect(tool.description).toContain('Start a vitest test session');
        expect(tool.inputSchema.type).toBe('object');

        const props = tool.inputSchema.properties as Record<string, { type: string }>;
        expect(props.tests.type).toBe('array');
        expect(props.testPattern.type).toBe('string');
        expect(props.timeout.type).toBe('number');
        expect(props.maxTimeout.type).toBe('number');
        expect(props.maxConsoleEntries.type).toBe('number');
        expect(props.consoleLogTTL.type).toBe('number');
      });
    });

    describe('getResults tool schema', () => {
      it('should have correct structure with required sessionId', () => {
        const command = createCommand();
        const tools = command.getMCPDefinitions();
        const tool = tools.find((t) => t.name === 'getResults')!;

        expect(tool.description).toContain('Query test results');
        expect(tool.inputSchema.required).toEqual(['sessionId']);

        const props = tool.inputSchema.properties as Record<string, { type: string }>;
        expect(props.sessionId.type).toBe('string');
        expect(props.includeStackTraces.type).toBe('boolean');
        expect(props.testFile.type).toBe('string');
        expect(props.testName.type).toBe('string');
      });
    });

    describe('queryConsole tool schema', () => {
      it('should have correct structure with streamType enum', () => {
        const command = createCommand();
        const tools = command.getMCPDefinitions();
        const tool = tools.find((t) => t.name === 'queryConsole')!;

        expect(tool.description).toContain('console output');
        expect(tool.inputSchema.required).toEqual(['sessionId']);

        const props = tool.inputSchema.properties as Record<
          string,
          { type: string; enum?: string[] }
        >;
        expect(props.sessionId.type).toBe('string');
        expect(props.streamType.enum).toEqual(['stdout', 'stderr', 'both']);
      });
    });

    describe('getSessionStatus tool schema', () => {
      it('should have correct structure', () => {
        const command = createCommand();
        const tools = command.getMCPDefinitions();
        const tool = tools.find((t) => t.name === 'getSessionStatus')!;

        expect(tool.description).toContain('Get current status');
        expect(tool.inputSchema.required).toEqual(['sessionId']);
      });
    });
  });

  // Run sequentially to avoid spawning too many nested vitest processes
  describe.sequential('Real Session Execution via MCP', () => {
    it('should execute startSession with basic-project fixture', async () => {
      const command = createCommand();
      const fixture = await prepareFixture('basic-project');

      const result = await command.executeToolViaMCP('startSession', {
        root: fixture.tempPath,
        timeout: 30000,
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text as string);
      expect(data.sessionId).toBeDefined();
      expect(data.status).toBe('completed');
      expect(data.summary.total).toBe(6);
      expect(data.summary.passed).toBe(6);
      expect(data.summary.failed).toEqual({});
    }, 60000);

    it('should execute getResults with session from real fixture', async () => {
      const command = createCommand();
      const fixture = await prepareFixture('basic-project');

      // Start a session first
      const startResult = await command.executeToolViaMCP('startSession', {
        root: fixture.tempPath,
        timeout: 30000,
      });

      const startData = JSON.parse(startResult.content[0].text as string);
      const sessionId = startData.sessionId;

      // Get results (summary only, no filters)
      const result = await command.executeToolViaMCP('getResults', {
        sessionId,
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text as string);
      expect(data.sessionId).toBe(sessionId);
      expect(data.summary).toBeDefined();
      expect(data.summary.total).toBe(6);
      expect(data.summary.passed).toBe(6);
    }, 60000);

    it('should execute getResults with filters to get detailed results', async () => {
      const command = createCommand();
      const fixture = await prepareFixture('failing-tests');

      // Start a session with failing-tests fixture
      const startResult = await command.executeToolViaMCP('startSession', {
        root: fixture.tempPath,
        timeout: 30000,
      });

      const startData = JSON.parse(startResult.content[0].text as string);
      const sessionId = startData.sessionId;

      // Get results with testFile filter
      const result = await command.executeToolViaMCP('getResults', {
        sessionId,
        testFile: 'math.test.ts',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text as string);
      expect(data.sessionId).toBe(sessionId);
      expect(data.queryResults).toBeDefined();
      expect(data.queryResults.files).toBeDefined();
      expect(Array.isArray(data.queryResults.files)).toBe(true);
    }, 60000);

    it('should execute queryConsole with session from console-output fixture', async () => {
      const command = createCommand();
      const fixture = await prepareFixture('console-output');

      // Start a session with console-output fixture
      const startResult = await command.executeToolViaMCP('startSession', {
        root: fixture.tempPath,
        timeout: 30000,
      });

      const startData = JSON.parse(startResult.content[0].text as string);
      const sessionId = startData.sessionId;

      // Query console output
      const result = await command.executeToolViaMCP('queryConsole', {
        sessionId,
        streamType: 'both',
      });

      expect(result.isError).toBeUndefined();
      const data = JSON.parse(result.content[0].text as string);
      expect(data.entries).toBeDefined();
      expect(Array.isArray(data.entries)).toBe(true);
      expect(data.totalMatches).toBeDefined();
      expect(typeof data.totalMatches).toBe('number');
    }, 60000);
  });

  describe('Error Handling', () => {
    it('should return error for unknown tool (with and without prefix)', async () => {
      const command = createCommand();

      // Test without prefix
      const result1 = await command.executeToolViaMCP('unknownTool', {});
      expect(result1.content[0].text).toBe('Unknown tool: unknownTool');
      expect(result1.isError).toBe(true);

      // Test with vitest_ prefix
      const result2 = await command.executeToolViaMCP('vitest_unknownTool', {});
      expect(result2.content[0].text).toBe('Unknown tool: vitest_unknownTool');
      expect(result2.isError).toBe(true);
    });

    it('should return error for invalid session ID', async () => {
      const command = createCommand();
      const result = await command.executeToolViaMCP('getResults', {
        sessionId: 'invalid-session-id',
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Session not found');
    });
  });

  // Run sequentially to avoid spawning nested vitest in parallel
  describe.sequential('Response Formatting', () => {
    it('should format JSON with proper indentation', async () => {
      const command = createCommand();
      const fixture = await prepareFixture('basic-project');

      const result = await command.executeToolViaMCP('startSession', {
        root: fixture.tempPath,
        timeout: 30000,
      });

      expect(result.content[0].type).toBe('text');
      const text = result.content[0].text as string;
      expect(text).toContain('\n'); // Indented JSON
      expect(() => JSON.parse(text)).not.toThrow();
      expect(result.isError).toBeUndefined();
    }, 60000);
  });
});
