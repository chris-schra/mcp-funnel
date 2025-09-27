import { describe, it, expect } from 'vitest';
import { NodeDebugAdapter } from './node-adapter.js';

function invokeHandleDebuggerPaused(
  adapter: NodeDebugAdapter,
  params: unknown,
) {
  (
    adapter as unknown as { handleDebuggerPaused(p: unknown): void }
  ).handleDebuggerPaused(params);
}

describe('NodeDebugAdapter pause semantics', () => {
  it('marks breakpoint hits and reports debugger statement pauses', () => {
    const adapter = new NodeDebugAdapter();
    const capturedStates: unknown[] = [];

    adapter.onPaused((state) => {
      capturedStates.push(state);
    });

    (
      adapter as unknown as { scriptIdToUrl: Map<string, string> }
    ).scriptIdToUrl.set('script-1', '/Users/example/app/index.js');
    (
      adapter as unknown as { breakpoints: Map<string, unknown> }
    ).breakpoints.set('bp-1', {
      breakpointId: 'bp-1',
      locations: [
        {
          scriptId: 'script-1',
          lineNumber: 40,
          columnNumber: 0,
        },
      ],
    });

    invokeHandleDebuggerPaused(adapter, {
      reason: 'debugCommand',
      callFrames: [
        {
          callFrameId: '0',
          functionName: 'userFunction',
          location: {
            scriptId: 'script-1',
            lineNumber: 41,
            columnNumber: 0,
          },
          url: '/Users/example/app/index.js',
          scopeChain: [],
        },
      ],
      hitBreakpoints: ['bp-1'],
    });

    expect(capturedStates).toHaveLength(1);
    const state = capturedStates[0] as {
      pauseReason?: string;
      breakpoint?: {
        verified: boolean;
        resolvedLocations?: Array<{ file: string }>;
      };
    };

    expect(state.pauseReason).toBe('debugger');
    expect(state.breakpoint?.verified).toBe(true);
    expect(state.breakpoint?.resolvedLocations?.[0]?.file).toMatch(
      /index\.js$/,
    );
  });
});
