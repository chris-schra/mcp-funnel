import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CallToolResult } from '@mcp-funnel/commands-core';

import { JsDebuggerCommand } from './command.js';
import { SessionManager } from './session-manager.js';

interface DebugResponse {
  sessionId: string;
  status: string;
  mock?: boolean;
  message?: string;
  breakpoint?: {
    file: string;
    line: number;
    verified?: boolean;
  };
  pauseReason?: string;
  location?: {
    file?: string;
    relativePath?: string;
    line?: number;
    type?: string;
  };
  hint?: string;
  breakpoints?: {
    requested: number;
    set: number;
    pending: unknown[];
  };
}

/**
 * Test helper to extract and parse JSON from MCP CallToolResult response.
 * @param result - MCP tool execution result containing text content
 * @returns Parsed JSON data from the result's text content
 * @throws Error When result lacks text content or content is not a string
 * @internal
 * @see file:./command.ts - JsDebuggerCommand implementation being tested
 */
function parseResult<T = Record<string, unknown>>(result: CallToolResult): T {
  const textContent = result.content?.find((item) => item.type === 'text');
  if (!textContent || typeof textContent.text !== 'string') {
    throw new Error('Expected text content in CallToolResult');
  }

  return JSON.parse(textContent.text) as T;
}

const MOCK_DEBUG_ARGS = {
  platform: 'node',
  target: 'mock-target.js',
  breakpoints: [{ file: 'mock-target.js', line: 10 }],
  args: ['--demo-flag', '123'],
  useMock: true,
};

describe('JsDebuggerCommand mock mode', () => {
  beforeEach(() => {
    SessionManager.resetInstance();
    delete process.env.JS_DEBUGGER_REAL;
  });

  afterEach(() => {
    SessionManager.resetInstance();
    delete process.env.JS_DEBUGGER_REAL;
  });

  it('creates mock sessions when useMock is true and lists them', async () => {
    const command = new JsDebuggerCommand();

    const debugResult = await command.executeToolViaMCP(
      'debug',
      MOCK_DEBUG_ARGS,
    );
    const debugPayload = parseResult<DebugResponse>(debugResult);

    expect(debugPayload.mock).toBe(true);
    expect(debugPayload.status).toBe('paused');

    const { sessionId } = debugPayload;
    expect(typeof sessionId).toBe('string');

    const listResult = await command.executeToolViaMCP('list_sessions', {});
    const listPayload = parseResult<{
      sessions: Array<Record<string, unknown>>;
    }>(listResult);

    const mockEntry = listPayload.sessions.find(
      (session) => session.id === sessionId && session.mock === true,
    );

    expect(mockEntry).toBeDefined();
  });

  it('routes stack trace, variables, and console output through mock handlers', async () => {
    const command = new JsDebuggerCommand();

    const debugResult = await command.executeToolViaMCP(
      'debug',
      MOCK_DEBUG_ARGS,
    );
    const { sessionId } = parseResult<DebugResponse>(debugResult);

    const storedSession = (
      command as unknown as {
        mockSessionManager: {
          getMockSession(
            id: string,
          ): { request: { args?: string[] } } | undefined;
        };
      }
    ).mockSessionManager.getMockSession(sessionId);

    expect(storedSession?.request.args).toEqual(['--demo-flag', '123']);

    const stacktraceResult = await command.executeToolViaMCP('get_stacktrace', {
      sessionId,
    });
    const stacktracePayload = parseResult<{
      status: string;
      pauseReason: string;
      stackTrace: Array<{ functionName: string }>;
      location?: { type?: string; relativePath?: string; line?: number };
      breakpoints?: { set: number; pending: unknown[] };
      message: string;
      hint?: string;
    }>(stacktraceResult);

    expect(stacktracePayload.status).toBe('paused');
    expect(stacktracePayload.pauseReason).toBe('breakpoint');
    expect(stacktracePayload.stackTrace?.[0]?.functionName).toBe(
      'processUserData',
    );
    expect(stacktracePayload.location?.type).toBe('user');
    expect(stacktracePayload.location?.relativePath).toMatch(
      /mock-target\.js$/,
    );
    expect(stacktracePayload.message).toMatch(/Paused at breakpoint/);
    expect(stacktracePayload.breakpoints?.set).toBeGreaterThan(0);
    expect(stacktracePayload.hint).toMatch(/continue/i);

    const variablesResult = await command.executeToolViaMCP('get_variables', {
      sessionId,
      frameId: 0,
      path: 'userData.profile.settings.theme',
    });
    const variablesPayload = parseResult<{
      sessionId: string;
      frameId: number;
      path: string;
      result: { found: boolean; value?: unknown; type?: string };
    }>(variablesResult);

    expect(variablesPayload.sessionId).toBe(sessionId);
    expect(variablesPayload.path).toBe('userData.profile.settings.theme');
    expect(variablesPayload.result.found).toBe(true);
    expect(variablesPayload.result.value).toBe('dark');

    const consoleResult = await command.executeToolViaMCP(
      'search_console_output',
      {
        sessionId,
        levels: { log: true, error: true },
      },
    );
    const consolePayload = parseResult<{
      sessionId: string;
      status: string;
      consoleOutput: Array<{ level: string }>;
    }>(consoleResult);

    expect(consolePayload.sessionId).toBe(sessionId);
    expect(consolePayload.status).toBe('mock');
    expect(consolePayload.consoleOutput.length).toBeGreaterThan(0);

    const stopResult = await command.executeToolViaMCP('stop', { sessionId });
    const stopPayload = parseResult<{ status: string }>(stopResult);
    expect(stopPayload.status).toBe('terminated');
  });

  it('supports mock session continuation and evaluation', async () => {
    const command = new JsDebuggerCommand();

    const debugResult = await command.executeToolViaMCP(
      'debug',
      MOCK_DEBUG_ARGS,
    );
    const { sessionId } = parseResult<DebugResponse>(debugResult);

    const evaluateResult = await command.executeToolViaMCP('continue', {
      sessionId,
      evaluate: 'answer',
    });
    const evaluatePayload = parseResult<{
      sessionId: string;
      status: string;
      evaluation: { result: string };
    }>(evaluateResult);

    expect(evaluatePayload.sessionId).toBe(sessionId);
    expect(evaluatePayload.status).toBe('paused');
    expect(evaluatePayload.evaluation.result).toContain('[Mock evaluated');

    const continueResult = await command.executeToolViaMCP('continue', {
      sessionId,
      action: 'continue',
    });
    const continuePayload = parseResult<{ status: string; message: string }>(
      continueResult,
    );

    expect(continuePayload.status).toBe('completed');
    expect(continuePayload.message).toContain('completed');
  });

  it('returns an error response when variable path is omitted', async () => {
    const command = new JsDebuggerCommand();

    const debugResult = await command.executeToolViaMCP(
      'debug',
      MOCK_DEBUG_ARGS,
    );
    const { sessionId } = parseResult<DebugResponse>(debugResult);

    const resultWithoutPath = await command.executeToolViaMCP('get_variables', {
      sessionId,
    });

    const payload = parseResult<{ error: string }>(resultWithoutPath);

    expect(payload.error).toMatch(/Variable path is required/i);
  });

  it('activates mock mode when JS_DEBUGGER_REAL is false', async () => {
    process.env.JS_DEBUGGER_REAL = 'false';
    const command = new JsDebuggerCommand();

    const debugResult = await command.executeToolViaMCP('debug', {
      platform: 'node',
      target: 'env-mock.js',
      breakpoints: [{ file: 'env-mock.js', line: 5 }],
    });

    const payload = parseResult<DebugResponse>(debugResult);
    expect(payload.mock).toBe(true);
    expect(payload.status).toBe('paused');
    expect(payload.breakpoint?.file).toMatch(/env-mock\.js$/);
  });
});
