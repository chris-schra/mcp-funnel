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
