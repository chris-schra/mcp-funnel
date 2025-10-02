import Emittery from 'emittery';
import type {
  DebugSessionStatus,
  PauseDetails,
  ScriptMetadata,
} from '../types/index.js';
import type {
  CdpCallFrame,
  CdpExceptionDetails,
  CdpStackTrace,
  ConsoleAPICalledEvent,
  ScriptParsedEvent,
  SessionEvents,
} from './session-types.js';
import {
  buildConsoleEntry,
  createExceptionEntry,
  mapCallFrame,
  mapConsoleLevel,
} from './session-mappers.js';
import { createSourceMap } from './session-source-maps.js';
import { normalizeLocationReference } from './session-breakpoints.js';
import { OutputBuffer } from './output-buffer.js';
import type { SessionBreakpointManager } from './session-breakpoint-manager.js';

/**
 * Processes CDP events for a debugger session.
 */
export class SessionEventProcessor {
  private lastPause?: PauseDetails;

  public constructor(
    private readonly sessionId: string,
    private readonly scripts: Map<string, ScriptMetadata>,
    private readonly scriptUrls: Map<string, string>,
    private readonly scriptIdsByPath: Map<string, string>,
    private readonly scriptIdsByFileUrl: Map<string, string>,
    private readonly targetWorkingDirectory: string,
    private readonly outputBuffer: OutputBuffer,
    private readonly events: Emittery<SessionEvents>,
    private readonly updateStatus: (status: DebugSessionStatus) => void,
    private readonly breakpointManager: SessionBreakpointManager,
  ) {}

  public getLastPause(): PauseDetails | undefined {
    return this.lastPause;
  }

  public clearLastPause(): void {
    this.lastPause = undefined;
  }

  public handleEvent(method: string, params: unknown): void {
    switch (method) {
      case 'Debugger.paused':
        this.onPaused(
          params as {
            reason: string;
            callFrames: CdpCallFrame[];
            hitBreakpoints?: string[];
            data?: Record<string, unknown>;
            asyncStackTrace?: CdpStackTrace;
          },
        );
        break;
      case 'Debugger.resumed':
        this.onResumed();
        break;
      case 'Debugger.scriptParsed':
        void this.onScriptParsed(params as ScriptParsedEvent);
        break;
      case 'Runtime.consoleAPICalled':
        this.onConsoleAPICalled(params as ConsoleAPICalledEvent);
        break;
      case 'Runtime.exceptionThrown':
        this.onExceptionThrown(
          params as {
            timestamp: number;
            exceptionDetails: CdpExceptionDetails;
          },
        );
        break;
      case 'Log.entryAdded':
        this.onLogEntry(
          params as {
            entry: { level: string; args?: unknown[]; timestamp: number };
          },
        );
        break;
      default:
        break;
    }
  }

  private async onScriptParsed(event: ScriptParsedEvent): Promise<void> {
    if (!event.scriptId) {
      return;
    }

    const metadata: ScriptMetadata = {
      scriptId: event.scriptId,
      url: event.url,
      sourceMapUrl: event.sourceMapURL,
    };

    if (event.url) {
      const reference = normalizeLocationReference(
        event.url,
        this.targetWorkingDirectory,
      );
      metadata.normalizedPath = reference.path;
      metadata.fileUrl = reference.fileUrl;
    }

    this.scriptUrls.set(event.scriptId, event.url ?? '');
    this.scripts.set(event.scriptId, metadata);
    this.indexScriptMetadata(metadata);

    if (event.sourceMapURL) {
      try {
        const sourceMap = await createSourceMap(
          metadata,
          event.sourceMapURL,
          this.targetWorkingDirectory,
        );
        if (sourceMap) {
          metadata.sourceMap = sourceMap;
        }
      } catch (error) {
        console.warn(
          `Session ${this.sessionId}: Failed to load source map for ${event.url ?? event.scriptId}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    await this.breakpointManager.upgradePendingBreakpoints(metadata);
  }

  private onPaused(payload: {
    reason: string;
    callFrames: CdpCallFrame[];
    hitBreakpoints?: string[];
    data?: Record<string, unknown>;
    asyncStackTrace?: CdpStackTrace;
  }): void {
    const pause: PauseDetails = {
      reason: payload.reason,
      callFrames: payload.callFrames.map(mapCallFrame),
      hitBreakpoints: this.mapHitBreakpoints(payload.hitBreakpoints),
      data: payload.data,
      asyncStackTrace: payload.asyncStackTrace
        ? {
            description: payload.asyncStackTrace.description,
            callFrames: payload.asyncStackTrace.callFrames.map((frame) => ({
              functionName: frame.functionName,
              scriptId: frame.scriptId,
              url: frame.url,
              lineNumber: frame.lineNumber,
              columnNumber: frame.columnNumber ?? 0,
            })),
            parent: undefined,
            parentId: payload.asyncStackTrace.parentId
              ? { ...payload.asyncStackTrace.parentId }
              : undefined,
          }
        : undefined,
    };
    this.lastPause = pause;
    this.updateStatus('paused');
    void this.events.emit('paused', pause);
  }

  private onResumed(): void {
    this.lastPause = undefined;
    this.updateStatus('running');
    void this.events.emit('resumed');
  }

  private onConsoleAPICalled(event: ConsoleAPICalledEvent): void {
    const entry = buildConsoleEntry(
      mapConsoleLevel(event.type),
      'console',
      event.args ?? [],
      event.timestamp,
      event.stackTrace,
    );
    this.outputBuffer.addConsole(entry);
  }

  private onExceptionThrown(event: {
    timestamp: number;
    exceptionDetails: CdpExceptionDetails;
  }): void {
    const entry = createExceptionEntry(event.exceptionDetails, event.timestamp);
    this.outputBuffer.addException(entry);
  }

  private onLogEntry(payload: {
    entry: { level: string; args?: unknown[]; timestamp: number };
  }): void {
    const entry = payload.entry;
    const consoleEntry = buildConsoleEntry(
      mapConsoleLevel(entry.level),
      'log-entry',
      (entry.args as never[]) ?? [],
      entry.timestamp,
      undefined,
    );
    this.outputBuffer.addConsole(consoleEntry);
  }

  private mapHitBreakpoints(hit?: string[]): string[] | undefined {
    if (!hit || hit.length === 0) {
      return hit;
    }
    const mapped: string[] = [];
    for (const cdpId of hit) {
      const record = this.breakpointManager.findRecordByCdpId(cdpId);
      if (!record) {
        mapped.push(cdpId);
        continue;
      }
      mapped.push(record.id);
    }
    return mapped;
  }

  private indexScriptMetadata(metadata: ScriptMetadata): void {
    if (metadata.normalizedPath) {
      this.scriptIdsByPath.set(metadata.normalizedPath, metadata.scriptId);
    }
    if (metadata.fileUrl) {
      this.scriptIdsByFileUrl.set(metadata.fileUrl, metadata.scriptId);
    }
  }
}
