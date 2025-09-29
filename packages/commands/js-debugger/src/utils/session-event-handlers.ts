import {
  DebugSession,
  DebugState,
  ConsoleMessage,
  SessionCleanupConfig,
} from '../types/index.js';
import { SessionActivityTracker } from './session-activity-tracker.js';
import { shouldIncludeConsoleMessage } from './console-filtering.js';
import { estimateSessionMemoryUsage } from './session-memory-utils.js';

/**
 * Add console output with memory management (circular buffer)
 */
export function addConsoleOutputWithMemoryManagement(
  session: DebugSession,
  message: ConsoleMessage,
  cleanupConfig: SessionCleanupConfig,
): void {
  session.consoleOutput.push(message);

  // Implement circular buffer to prevent unbounded memory growth
  if (session.consoleOutput.length > cleanupConfig.maxConsoleOutputEntries) {
    // Remove oldest entries, keep recent ones
    const keepCount = Math.floor(cleanupConfig.maxConsoleOutputEntries * 0.8); // Keep 80%
    session.consoleOutput = session.consoleOutput.slice(-keepCount);
  }

  // Update memory usage estimate
  if (session.metadata) {
    session.metadata.resourceUsage.consoleOutputSize =
      session.consoleOutput.length;
    session.metadata.resourceUsage.memoryEstimate =
      estimateSessionMemoryUsage(session);
  }
}

/**
 * Update session activity metadata
 */
export function updateSessionActivity(
  session: DebugSession,
  activityTracker: SessionActivityTracker,
): void {
  if (session.metadata) {
    const now = new Date().toISOString();
    session.metadata.lastActivityAt = now;
    session.metadata.activityCount = activityTracker.getActivityCount(
      session.id,
    );
  }
}

/**
 * Setup enhanced event handlers for a debug session with memory leak prevention
 */
export function setupSessionEventHandlers(
  session: DebugSession,
  activityTracker: SessionActivityTracker,
  cleanupConfig: SessionCleanupConfig,
  onConsoleOutput: (session: DebugSession, message: ConsoleMessage) => void,
  onStateChange: (session: DebugSession) => void,
): void {
  const { adapter, request } = session;

  // Console output handler with verbosity filtering and memory management
  if (request.captureConsole !== false) {
    adapter.onConsoleOutput((message: ConsoleMessage) => {
      if (shouldIncludeConsoleMessage(message, request.consoleVerbosity)) {
        onConsoleOutput(session, message);
        activityTracker.recordActivity(session.id, 'console_output');
        updateSessionActivity(session, activityTracker);
      }
    });
  }

  // Enhanced pause handler
  adapter.onPaused((state: DebugState) => {
    session.state = state;
    session.lifecycleState = 'active'; // Update lifecycle state
    activityTracker.recordActivity(session.id, 'state_change');
    onStateChange(session);
  });

  // Enhanced resume handler
  adapter.onResumed(() => {
    session.state = { status: 'running' };
    session.lifecycleState = 'active'; // Update lifecycle state
    activityTracker.recordActivity(session.id, 'state_change');
    onStateChange(session);
  });
}
