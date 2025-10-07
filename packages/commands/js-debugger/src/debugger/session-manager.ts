import { randomUUID } from 'node:crypto';

import type {
  DebuggerCommand,
  DebuggerCommandResult,
  DebugSessionConfig,
  DebugSessionDescriptor,
  DebugSessionId,
  DebugSessionSnapshot,
  OutputQuery,
  OutputQueryResult,
  ScopeQuery,
  ScopeQueryResult,
  StartDebugSessionResponse,
} from '../types/index.js';
import { DebuggerSession } from './session.js';

export class DebuggerSessionManager {
  private readonly sessions = new Map<DebugSessionId, DebuggerSession>();

  public async startSession(
    config: DebugSessionConfig,
  ): Promise<StartDebugSessionResponse> {
    const sessionId = config.id ?? randomUUID();
    if (this.sessions.has(sessionId)) {
      throw new Error(`Session with id ${sessionId} already exists.`);
    }
    const sessionConfig: DebugSessionConfig = { ...config, id: sessionId };
    const session = new DebuggerSession(sessionId, sessionConfig);
    this.sessions.set(sessionId, session);
    session.onTerminated(() => {
      this.sessions.delete(sessionId);
    });
    try {
      return await session.initialize();
    } catch (error) {
      this.sessions.delete(sessionId);
      throw error;
    }
  }

  public async terminateSession(
    sessionId: DebugSessionId,
    timeoutMs = 5000,
  ): Promise<void> {
    const session = this.requireSession(sessionId);
    const descriptor = session.getDescriptor();

    if (descriptor.state.status === 'terminated') {
      return;
    }

    return Promise.race([
      new Promise<void>((resolve) => {
        session.onTerminated(() => resolve());
        session.terminate();
      }),
      new Promise<void>((_, reject) =>
        setTimeout(
          () =>
            reject(
              new Error(
                `Session ${sessionId} termination timed out after ${timeoutMs}ms`,
              ),
            ),
          timeoutMs,
        ),
      ),
    ]);
  }

  public getSession(sessionId: DebugSessionId): DebuggerSession | undefined {
    return this.sessions.get(sessionId);
  }

  public getDescriptor(sessionId: DebugSessionId): DebugSessionDescriptor {
    return this.requireSession(sessionId).getDescriptor();
  }

  public getSnapshot(sessionId: DebugSessionId): DebugSessionSnapshot {
    return this.requireSession(sessionId).getSnapshot();
  }

  public async runCommand(
    command: DebuggerCommand,
  ): Promise<DebuggerCommandResult> {
    const session = this.requireSession(command.sessionId);
    return session.runCommand(command);
  }

  /**
   * Runs a debugger command and waits for execution state to stabilize.
   *
   * Unlike runCommand (which returns immediately after sending to CDP),
   * this method waits for the next stable state ('paused', 'running', or 'terminated').
   *
   * Use this when you need to know the actual outcome, not just command acknowledgment.
   *
   * @param command - The debugger command to execute
   * @param options - Wait options (timeoutMs, defaults to 5000ms)
   * @returns Result including the stabilized state and pause details if applicable
   *
   * @example
   * // Wait for continue to complete (either running or hit breakpoint)
   * const result = await runCommandAndWait(\{
   *   sessionId: 'abc',
   *   action: 'continue'
   * \});
   * // result.session.state.status will be 'running', 'paused', or 'terminated' (not 'transitioning')
   * // If paused, result.pause will contain the pause details
   */
  public async runCommandAndWait(
    command: DebuggerCommand,
    options: { timeoutMs?: number } = {},
  ): Promise<DebuggerCommandResult> {
    const session = this.requireSession(command.sessionId);
    const result = await this.runCommand(command);

    // Check if already in stable state (using new state field)
    const snapshot = session.getSnapshot();
    const state = snapshot.session.state;
    const isStable =
      state.status === 'paused' ||
      state.status === 'running' ||
      state.status === 'terminated';

    if (isStable) {
      // Already stable, return result with pause details if paused
      if (state.status === 'paused' && !result.pause) {
        return {
          ...result,
          pause: state.pause,
        };
      }
      return result;
    }

    // Wait for stable state
    const timeoutMs = options.timeoutMs ?? 5000;
    const stableSnapshot = await this.waitForStableState(
      command.sessionId,
      timeoutMs,
    );

    // Extract pause details from stable state if paused
    let pauseDetails = result.pause;
    const stableState = stableSnapshot.session.state;
    if (stableState.status === 'paused' && !pauseDetails) {
      pauseDetails = stableState.pause;
    }

    return {
      ...result,
      session: stableSnapshot.session,
      pause: pauseDetails,
    };
  }

  private async waitForStableState(
    sessionId: string,
    timeoutMs: number,
  ): Promise<import('../types/index.js').DebugSessionSnapshot> {
    const session = this.requireSession(sessionId);
    try {
      return await this.pollForStableState(() => {
        const snapshot = session.getSnapshot();
        const state = snapshot.session.state;
        return state.status === 'paused' ||
          state.status === 'running' ||
          state.status === 'terminated'
          ? snapshot
          : null;
      }, timeoutMs);
    } catch (error) {
      const currentSnapshot = session.getSnapshot();
      throw new Error(
        `Timeout waiting for session ${sessionId} to reach stable state. ` +
          `Current state: ${currentSnapshot.session.state.status}. ` +
          `Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async pollForStableState<T>(
    factory: () => T | null | undefined,
    timeoutMs: number,
  ): Promise<T> {
    const intervalMs = 50;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const result = factory();
      if (result !== null && result !== undefined) {
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error('Timeout waiting for condition');
  }

  public async queryOutput(query: OutputQuery): Promise<OutputQueryResult> {
    const session = this.requireSession(query.sessionId);
    return session.queryOutput(query);
  }

  public async getScopeVariables(query: ScopeQuery): Promise<ScopeQueryResult> {
    const session = this.requireSession(query.sessionId);
    return session.getScopeVariables(query);
  }

  private requireSession(sessionId: DebugSessionId): DebuggerSession {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Debugger session ${sessionId} not found.`);
    }
    return session;
  }
}
