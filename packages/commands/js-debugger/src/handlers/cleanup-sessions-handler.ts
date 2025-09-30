import type {
  IToolHandler,
  ToolHandlerContext,
  CallToolResult,
} from '../types/index.js';

/**
 * Arguments for the cleanup_sessions tool handler.
 * @public
 * @see file:./cleanup-sessions-handler.ts:28 - CleanupSessionsHandler usage
 */
export interface CleanupSessionsHandlerArgs {
  /**
   * Force cleanup of all inactive sessions regardless of thresholds.
   *
   * When true, bypasses normal inactivity checks and cleans up sessions
   * that match any cleanup criteria (inactive OR exceeding memory).
   */
  force?: boolean;

  /**
   * Preview mode - show what would be cleaned without actually cleaning.
   *
   * Returns detailed information about cleanup candidates and configuration
   * without performing any actual session termination.
   */
  dryRun?: boolean;
}

/**
 * Tool handler for cleaning up inactive debug sessions.
 *
 * Provides manual and dry-run capabilities for session cleanup, allowing
 * users to identify stale sessions and reclaim resources. Implements the
 * IToolHandler SEAM for modular tool handling within the debugger command.
 *
 * Cleanup criteria:
 * - Session inactivity exceeding configured timeout threshold
 * - Memory/resource usage exceeding configured limits
 * - Force flag overrides normal thresholds
 * @example Dry run to preview cleanup candidates
 * ```typescript
 * const handler = new CleanupSessionsHandler();
 * const result = await handler.handle({ dryRun: true }, context);
 * // Returns: { dryRun: true, sessionsToCleanup: 2, cleanupCandidates: [...] }
 * ```
 * @example Force cleanup of all inactive sessions
 * ```typescript
 * const handler = new CleanupSessionsHandler();
 * const result = await handler.handle({ force: true }, context);
 * // Returns: { cleanedSessions: 2, remainingSessions: 3, ... }
 * ```
 * @public
 * @see file:../command/tool-registration.ts:163-167 - Handler registration
 * @see file:../types/handlers.ts:14-17 - IToolHandler interface
 * @see file:../types/cleanup.ts:4-13 - SessionCleanupConfig definition
 * @see file:../cleanup.test.ts:55-70 - Usage in tests
 */
export class CleanupSessionsHandler
  implements IToolHandler<CleanupSessionsHandlerArgs>
{
  /**
   * Tool name identifier for MCP registration.
   * @public
   */
  public readonly name = 'cleanup_sessions';

  /**
   * Handles cleanup_sessions tool execution.
   *
   * Processes cleanup requests by either previewing cleanup candidates (dry run)
   * or performing actual session cleanup based on inactivity and resource thresholds.
   *
   * Behavior:
   * - Retrieves all active sessions from the session manager
   * - Applies cleanup criteria based on lastActivity timestamps and resource counts
   * - In dry run mode: returns preview of sessions that would be cleaned
   * - In normal mode: invokes sessionManager.cleanupInactiveSessions() to terminate matching sessions
   * - Returns formatted response with cleanup statistics and configuration
   * @param {CleanupSessionsHandlerArgs} args - Cleanup arguments controlling force and dryRun behavior
   * @param {ToolHandlerContext} context - Handler context providing sessionManager and responseFormatter
   * @returns {Promise<CallToolResult>} Promise resolving to formatted success or error response
   * @example Dry run preview
   * ```typescript
   * await handler.handle({ dryRun: true }, context);
   * // Returns: {
   * //   content: [{ type: 'text', text: JSON.stringify({
   * //     dryRun: true,
   * //     totalSessions: 5,
   * //     sessionsToCleanup: 2,
   * //     cleanupCandidates: [...],
   * //     cleanupConfig: {...}
   * //   }) }]
   * // }
   * ```
   * @example Actual cleanup
   * ```typescript
   * await handler.handle({ force: false }, context);
   * // Returns: {
   * //   content: [{ type: 'text', text: JSON.stringify({
   * //     cleanedSessions: 2,
   * //     remainingSessions: 3,
   * //     timestamp: '2025-09-30T...'
   * //   }) }]
   * // }
   * ```
   * @public
   * @see file:../types/handlers.ts:14-17 - IToolHandler.handle interface
   * @see file:../types/session.ts:112 - ISessionManager.cleanupInactiveSessions
   * @see file:../cleanup.test.ts:55-82 - Test cases demonstrating behavior
   */
  public async handle(
    args: CleanupSessionsHandlerArgs,
    context: ToolHandlerContext,
  ): Promise<CallToolResult> {
    try {
      const allSessions = context.sessionManager.listSessions();
      const cleanupConfig = context.sessionManager.getCleanupConfig?.() || {
        sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
        memoryThresholdBytes: 100 * 1024 * 1024, // 100MB
      };

      // Identify sessions that would be cleaned up
      const inactiveSessions = allSessions.filter((session) => {
        const lastActivity = session.metadata?.lastActivity;
        if (!lastActivity) return false;

        const lastActivityTime = new Date(lastActivity).getTime();
        const now = new Date().getTime();
        const isInactive =
          now - lastActivityTime > cleanupConfig.sessionTimeoutMs;

        const hasExceededMemory =
          session.metadata?.resourceCount &&
          session.metadata.resourceCount > 100; // Rough threshold

        return args.force || isInactive || hasExceededMemory;
      });

      if (args.dryRun) {
        return context.responseFormatter.success({
          dryRun: true,
          totalSessions: allSessions.length,
          sessionsToCleanup: inactiveSessions.length,
          cleanupCandidates: inactiveSessions.map((session) => ({
            sessionId: session.id,
            platform: session.platform,
            lastActivity: session.metadata?.lastActivity,
            lifecycleState: session.metadata?.lifecycleState,
            resourceCount: session.metadata?.resourceCount,
          })),
          cleanupConfig,
          message: 'Dry run completed - no sessions were actually cleaned up',
        });
      }

      // Perform actual cleanup
      const cleanedCount =
        (await context.sessionManager.cleanupInactiveSessions?.({
          force: args.force === true,
        })) || 0;

      return context.responseFormatter.success({
        totalSessions: allSessions.length,
        cleanedSessions: cleanedCount,
        remainingSessions: allSessions.length - cleanedCount,
        cleanupConfig,
        message: `Successfully cleaned up ${cleanedCount} inactive sessions`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      return context.responseFormatter.error(
        error instanceof Error ? error.message : 'Unknown error',
        {
          operation: 'cleanup_sessions',
          message: 'Failed to cleanup sessions',
        },
      );
    }
  }
}
