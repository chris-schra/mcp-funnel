import { describe, it, expect } from 'vitest';
import { DebugResponseFormatter } from './debug-response-formatter.js';
import type {
  DebugSession,
  IDebugAdapter,
  DebugState,
  DebugRequest,
  StackFrame,
  Scope,
  EvaluationResult,
  BreakpointRegistration,
} from '../types/index.js';

function createAdapterStub(stackFrames: StackFrame[]): IDebugAdapter {
  const adapter: Partial<IDebugAdapter> = {
    connect: async () => {},
    disconnect: async () => {},
    setBreakpoint: async () =>
      ({ id: 'stub', verified: false }) satisfies BreakpointRegistration,
    removeBreakpoint: async () => {},
    continue: async () => ({ status: 'running' }) satisfies DebugState,
    stepOver: async () => ({ status: 'running' }) satisfies DebugState,
    stepInto: async () => ({ status: 'running' }) satisfies DebugState,
    stepOut: async () => ({ status: 'running' }) satisfies DebugState,
    evaluate: async () =>
      ({ value: undefined, type: 'undefined' }) satisfies EvaluationResult,
    getStackTrace: async () => stackFrames,
    getScopes: async () => [] as Scope[],
    onConsoleOutput: () => {},
    onPaused: () => {},
    onResumed: () => {},
  };

  return adapter as IDebugAdapter;
}

describe('DebugResponseFormatter messaging', () => {
  it('provides entry pause guidance when stopped in runtime internals', async () => {
    const formatter = new DebugResponseFormatter();
    const adapter = createAdapterStub([
      {
        id: 0,
        functionName: '(anonymous)',
        file: 'internal/modules/cjs/loader.js',
        line: 1,
        column: 0,
        origin: 'internal',
      },
    ]);

    const session: DebugSession = {
      id: 'session-entry',
      adapter,
      request: {
        platform: 'node',
        target: '/path/to/script.js',
        stopOnEntry: true,
      } satisfies DebugRequest,
      breakpoints: new Map(),
      state: {
        status: 'paused',
        pauseReason: 'entry',
      } satisfies DebugState,
      startTime: new Date().toISOString(),
      consoleOutput: [],
    };

    const result = await formatter.debugState('session-entry', session);
    const payload = JSON.parse(result.content?.[0]?.text ?? '{}');

    expect(payload.message).toContain('Debugger attached and paused at entry');
    expect(payload.hint).toMatch(/continue/i);
  });

  it("clarifies pauses caused by manual 'debugger' statements", async () => {
    const formatter = new DebugResponseFormatter();
    const adapter = createAdapterStub([
      {
        id: 0,
        functionName: 'userFunction',
        file: '/Users/example/app/index.js',
        line: 42,
        column: 0,
        origin: 'user',
        relativePath: 'app/index.js',
      },
    ]);

    const session: DebugSession = {
      id: 'session-debugger',
      adapter,
      request: {
        platform: 'node',
        target: '/Users/example/app/index.js',
        stopOnEntry: true,
      } satisfies DebugRequest,
      breakpoints: new Map(),
      state: {
        status: 'paused',
        pauseReason: 'debugger',
      } satisfies DebugState,
      startTime: new Date().toISOString(),
      consoleOutput: [],
    };

    const result = await formatter.debugState('session-debugger', session);
    const payload = JSON.parse(result.content?.[0]?.text ?? '{}');

    expect(payload.message).toContain('Paused on debugger statement');
    expect(payload.hint).toMatch(/debugger statement/i);
  });
});
