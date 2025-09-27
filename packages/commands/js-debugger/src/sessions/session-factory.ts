import type { IDebugAdapter, DebugRequest } from '../types/index.js';
import { NodeDebugAdapter } from '../adapters/node-adapter.js';
import { BrowserAdapter } from '../adapters/browser-adapter.js';
import type { EnhancedDebugSession } from '../enhanced-debug-session.js';

/**
 * Factory interface for creating debug adapters
 */
export interface IAdapterFactory {
  createAdapter(
    platform: 'node' | 'browser',
    request?: DebugRequest,
  ): IDebugAdapter;
}

/**
 * Real adapter factory - creates appropriate adapters based on platform
 */
export class AdapterFactory implements IAdapterFactory {
  createAdapter(
    platform: 'node' | 'browser',
    request?: DebugRequest,
  ): IDebugAdapter {
    switch (platform) {
      case 'node':
        return new NodeDebugAdapter({
          request,
        });
      case 'browser':
        return new BrowserAdapter({ request });
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}

/**
 * Set initial breakpoints for a session
 */
export async function setInitialBreakpoints(
  session: EnhancedDebugSession,
  breakpoints: Array<{ file: string; line: number; condition?: string }>,
): Promise<void> {
  for (const bp of breakpoints) {
    try {
      await session.setBreakpoint(bp.file, bp.line, bp.condition);
    } catch (error) {
      // Continue with other breakpoints even if one fails
      console.warn(`Failed to set breakpoint at ${bp.file}:${bp.line}:`, error);
    }
  }
}
