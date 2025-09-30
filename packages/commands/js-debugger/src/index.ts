/**
 * JavaScript Debugger Command - Entry point for the js-debugger MCP command.
 *
 * This module provides a comprehensive debugging solution for Node.js and browser applications
 * through the Model Context Protocol (MCP). It exports the main command implementation, session
 * managers, adapters, and supporting types.
 *
 * Key exports:
 * - {@link JsDebuggerCommand} - Main MCP command handler
 * - {@link SessionManager} - Full-featured session lifecycle manager with cleanup and tracking
 * - {@link LightweightSessionManager} - Minimal session manager for simple use cases
 * - {@link EnhancedDebugSession} - Modern event-driven session API
 *
 * @example Basic usage as MCP command
 * ```typescript
 * import debuggerCommand from '@mcp-funnel/js-debugger';
 * // Command is automatically registered with MCP server
 * ```
 *
 * @example Direct session manager usage
 * ```typescript
 * import { SessionManager } from '@mcp-funnel/js-debugger';
 *
 * const manager = SessionManager.getInstance();
 * const session = await manager.createSession({
 *   platform: 'node',
 *   target: './app.js',
 *   breakpoints: [{ file: './app.js', line: 10 }]
 * });
 * ```
 *
 * @public
 * @see file:./command.ts - JsDebuggerCommand implementation
 * @see file:./session-manager.ts - SessionManager implementation
 * @see file:./lightweight-session-manager.ts - LightweightSessionManager implementation
 */

import { JsDebuggerCommand } from './command.js';

// Export main command
export { JsDebuggerCommand };
export default new JsDebuggerCommand();

// Export types
export * from './types/index.js';

// Export adapters
export * from './adapters/index.js';

// Export CDP components
export * from './cdp/index.js';

// Export session managers
export { SessionManager } from './session-manager.js';
export { default as sessionManager } from './session-manager.js';
export { LightweightSessionManager } from './lightweight-session-manager.js';
export { EnhancedDebugSession } from './enhanced-debug-session.js';
