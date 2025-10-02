import type {
  BreakpointLocation,
  BreakpointMutation,
  BreakpointSpec,
  BreakpointSummary,
  ScriptMetadata,
} from '../types/index.js';
import type {
  BreakpointRecord,
  CdpLocation,
  NormalizedScriptReference,
  PendingBreakpointUpgrade,
} from './session-types.js';
import { normalizeLocationReference } from './session-breakpoints.js';
import { SessionBreakpointInternals } from './session-breakpoint-internals.js';

/**
 * Manages breakpoint operations for a debugger session.
 */
export class SessionBreakpointManager {
  private readonly breakpointRecords = new Map<string, BreakpointRecord>();
  private readonly pendingBreakpointUpgrades = new Map<
    string,
    PendingBreakpointUpgrade
  >();
  private readonly pendingBreakpointKeys = new Map<string, Set<string>>();
  private readonly internals: SessionBreakpointInternals;

  public constructor(
    private readonly sessionId: string,
    private readonly scripts: Map<string, ScriptMetadata>,
    private readonly scriptIdsByPath: Map<string, string>,
    private readonly scriptIdsByFileUrl: Map<string, string>,
    private readonly targetWorkingDirectory: string,
    private readonly sendCommand: <T = unknown>(
      method: string,
      params?: Record<string, unknown>,
    ) => Promise<T>,
  ) {
    this.internals = new SessionBreakpointInternals(
      sessionId,
      scripts,
      targetWorkingDirectory,
      sendCommand,
      this.breakpointRecords,
      this.pendingBreakpointUpgrades,
      this.pendingBreakpointKeys,
      this.toCdpLocation.bind(this),
      this.fromCdpLocation.bind(this),
    );
  }

  public async applyBreakpointMutation(
    mutation?: BreakpointMutation,
  ): Promise<{ set: BreakpointSummary[]; removed: string[] }> {
    const applied: BreakpointSummary[] = [];
    const removed: string[] = [];

    if (!mutation) {
      return { set: applied, removed };
    }

    if (mutation.remove) {
      for (const id of mutation.remove) {
        const record = this.breakpointRecords.get(id);
        if (!record) {
          continue;
        }
        await this.sendCommand('Debugger.removeBreakpoint', {
          breakpointId: record.cdpId,
        });
        this.breakpointRecords.delete(id);
        this.internals.clearPendingUpgrade(id);
        removed.push(id);
      }
    }

    if (mutation.set) {
      for (const spec of mutation.set) {
        const summary = await this.registerBreakpoint(spec);
        applied.push(summary);
      }
    }

    return { set: applied, removed };
  }

  public async registerBreakpoint(
    spec: BreakpointSpec,
  ): Promise<BreakpointSummary> {
    if (!Number.isInteger(spec.location.lineNumber)) {
      throw new Error('Breakpoint lineNumber must be an integer.');
    }

    if (spec.location.scriptId) {
      const result = (await this.sendCommand('Debugger.setBreakpoint', {
        location: this.toCdpLocation(spec.location),
        condition: spec.condition,
      })) as {
        breakpointId: string;
        actualLocation: CdpLocation;
      };
      const summary: BreakpointSummary = {
        id: result.breakpointId,
        requested: spec,
        resolvedLocations: [this.fromCdpLocation(result.actualLocation)],
      };
      this.breakpointRecords.set(result.breakpointId, {
        id: result.breakpointId,
        cdpId: result.breakpointId,
        spec,
        resolved: summary.resolvedLocations,
      });
      return summary;
    }

    if (spec.location.url) {
      const reference = normalizeLocationReference(
        spec.location.url,
        this.targetWorkingDirectory,
      );
      const metadata = this.resolveScriptMetadata(reference);
      if (metadata) {
        try {
          return await this.internals.registerBreakpointForScript(
            metadata,
            spec,
            reference,
          );
        } catch (error) {
          console.warn(
            `Session ${this.sessionId}: Failed to map breakpoint for ${spec.location.url}: ${
              error instanceof Error ? error.message : String(error)
            }. Falling back to Debugger.setBreakpointByUrl.`,
          );
          const summary = await this.internals.registerBreakpointByUrl(spec);
          this.internals.trackPendingUpgrade(summary.id, reference);
          return summary;
        }
      }
      const summary = await this.internals.registerBreakpointByUrl(spec);
      this.internals.trackPendingUpgrade(summary.id, reference);
      return summary;
    }

    throw new Error('Breakpoint location requires either a scriptId or url.');
  }

  public resolveScriptMetadata(
    reference: NormalizedScriptReference,
  ): ScriptMetadata | undefined {
    if (reference.path) {
      const scriptId = this.scriptIdsByPath.get(reference.path);
      if (scriptId) {
        return this.scripts.get(scriptId);
      }
    }
    if (reference.fileUrl) {
      const scriptId = this.scriptIdsByFileUrl.get(reference.fileUrl);
      if (scriptId) {
        return this.scripts.get(scriptId);
      }
    }
    for (const metadata of this.scripts.values()) {
      if (metadata.url === reference.original) {
        return metadata;
      }
    }
    return undefined;
  }

  public async upgradePendingBreakpoints(
    metadata: ScriptMetadata,
  ): Promise<void> {
    return this.internals.upgradePendingBreakpoints(metadata);
  }

  public toCdpLocation(location: {
    scriptId?: string;
    url?: string;
    lineNumber: number;
    columnNumber?: number;
  }): CdpLocation {
    if (location.scriptId) {
      return {
        scriptId: location.scriptId,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber,
      };
    }
    if (location.url) {
      const reference = normalizeLocationReference(
        location.url,
        this.targetWorkingDirectory,
      );
      const metadata = this.resolveScriptMetadata(reference);
      if (metadata) {
        return {
          scriptId: metadata.scriptId,
          lineNumber: location.lineNumber,
          columnNumber: location.columnNumber,
        };
      }
      throw new Error(`No scriptId registered for url ${location.url}.`);
    }
    throw new Error('Location must provide a scriptId or url.');
  }

  public fromCdpLocation(location: CdpLocation): BreakpointLocation {
    return {
      scriptId: location.scriptId,
      url: this.scripts.get(location.scriptId)?.url,
      lineNumber: location.lineNumber,
      columnNumber: location.columnNumber,
    };
  }

  public findRecordByCdpId(cdpId: string): BreakpointRecord | undefined {
    for (const record of this.breakpointRecords.values()) {
      if (record.cdpId === cdpId) {
        return record;
      }
    }
    return undefined;
  }
}
