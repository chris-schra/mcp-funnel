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
  };
}

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

    const stacktraceResult = await command.executeToolViaMCP('get_stacktrace', {
      sessionId,
    });
    const stacktracePayload = parseResult<{
      status: string;
      stackTrace: Array<{ functionName: string }>;
    }>(stacktraceResult);

    expect(stacktracePayload.status).toBe('paused');
    expect(stacktracePayload.stackTrace?.[0]?.functionName).toBe(
      'processUserData',
    );

    const variablesResult = await command.executeToolViaMCP('get_variables', {
      sessionId,
      frameId: 0,
    });
    const variablesPayload = parseResult<{
      sessionId: string;
      frameId: number;
      scopes: Array<{ type: string }>;
    }>(variablesResult);

    expect(variablesPayload.sessionId).toBe(sessionId);
    expect(Array.isArray(variablesPayload.scopes)).toBe(true);
    expect(
      variablesPayload.scopes.some((scope) => scope.type === 'local'),
    ).toBe(true);

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
    expect(payload.breakpoint?.file).toBe('env-mock.js');
  });
});
