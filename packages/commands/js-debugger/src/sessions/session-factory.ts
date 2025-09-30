import type { IDebugAdapter, DebugRequest } from '../types/index.js';
import { NodeDebugAdapter } from '../adapters/node-adapter.js';
import { BrowserAdapter } from '../adapters/browser-adapter.js';
import type { EnhancedDebugSession } from '../enhanced-debug-session.js';

/**
 * Factory interface for creating platform-specific debug adapters.
 *
 * Provides a seam for dependency injection in SessionManager, enabling
 * testing with mock adapters and supporting future adapter implementations.
 * Implementations must return fully configured adapters ready for initialization.
 * @example Default factory usage
 * ```typescript
 * const factory = new AdapterFactory();
 * const adapter = factory.createAdapter('node', { target: './script.js' });
 * ```
 * @example Custom factory for testing
 * ```typescript
 * class MockAdapterFactory implements IAdapterFactory {
 *   createAdapter(): IDebugAdapter {
 *     return new MockDebugAdapter();
 *   }
 * }
 * ```
 * @public
 * @see file:./session-factory.ts:19-35 - AdapterFactory implementation
 * @see file:../session-manager.ts:119 - Used for dependency injection in SessionManager
 * @see file:../adapters/node-adapter.ts - NodeDebugAdapter implementation
 * @see file:../adapters/browser-adapter.ts - BrowserAdapter implementation
 */
export interface IAdapterFactory {
  /**
   * Creates a debug adapter for the specified platform.
   * @param platform - Target platform ('node' for Node.js, 'browser' for web debugging)
   * @param request - Optional debug configuration passed to adapter constructor
   * @returns Configured debug adapter ready for session initialization
   */
  createAdapter(
    platform: 'node' | 'browser',
    request?: DebugRequest,
  ): IDebugAdapter;
}

/**
 * Default adapter factory implementation for production use.
 *
 * Creates platform-specific debug adapters (NodeDebugAdapter or BrowserAdapter)
 * based on the requested platform. Used as the default factory in SessionManager
 * when no custom factory is provided.
 * @example Creating Node.js adapter
 * ```typescript
 * const factory = new AdapterFactory();
 * const adapter = factory.createAdapter('node', {
 *   target: './app.js',
 *   command: 'tsx'
 * });
 * ```
 * @public
 * @see file:../adapters/node-adapter.ts - NodeDebugAdapter constructor
 * @see file:../adapters/browser-adapter.ts - BrowserAdapter constructor
 * @see file:../session-manager.ts:122 - Default factory instantiation
 */
export class AdapterFactory implements IAdapterFactory {
  /**
   * Creates a platform-specific debug adapter.
   * @param platform - Target platform for debugging
   * @param request - Debug configuration including target, breakpoints, and options
   * @returns Configured adapter instance ready for initialization
   * @throws {Error} When platform is not 'node' or 'browser'
   */
  public createAdapter(
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
 * Sets initial breakpoints during session creation with fault tolerance.
 *
 * Iterates through the provided breakpoints and attempts to set each one on the session.
 * If any breakpoint fails to set (e.g., invalid file path, unsupported condition syntax),
 * a warning is logged but processing continues with remaining breakpoints. This ensures
 * partial breakpoint configuration doesn't prevent session creation.
 *
 * Called automatically by SessionManager.createSession() when request.breakpoints is provided.
 * @param session - Initialized debug session to configure
 * @param breakpoints - Array of breakpoint specifications from debug request
 * @returns Promise resolving when all breakpoint attempts complete
 * @example Setting breakpoints during session creation
 * ```typescript
 * const session = new EnhancedDebugSession(id, adapter, request);
 * await session.initialize();
 * await setInitialBreakpoints(session, [
 *   { file: './app.ts', line: 42 },
 *   { file: './utils.ts', line: 15, condition: 'count > 10' }
 * ]);
 * ```
 * @public
 * @see file:../session-manager.ts:301 - Called during session creation
 * @see file:../enhanced-debug-session.ts - EnhancedDebugSession.setBreakpoint method
 * @see file:../types/request.ts:8-12 - DebugRequest.breakpoints structure
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
