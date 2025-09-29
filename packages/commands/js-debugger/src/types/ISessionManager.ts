import type { DebugState } from './DebugState.js';
import type { DebugRequest } from './index.js';
import type { DebugSession } from './DebugSession.js';
import type { SessionLifecycleState } from './SessionLifecycleState.js';
import type { SessionCleanupConfig } from './SessionCleanupConfig.js';

export interface ISessionManager {
  createSession(request: DebugRequest): Promise<string>;
  getSession(id: string): DebugSession | undefined;
  deleteSession(id: string): void;
  listSessions(): Array<{
    id: string;
    platform: string;
    target: string;
    state: DebugState;
    startTime: string;
    metadata?: {
      lifecycleState?: SessionLifecycleState;
      lastActivity?: string;
      resourceCount?: number;
    };
  }>;
  // Enhanced cleanup methods
  cleanupInactiveSessions?(): Promise<number>;
  getCleanupConfig?(): SessionCleanupConfig;
  setCleanupConfig?(config: Partial<SessionCleanupConfig>): void;
}
