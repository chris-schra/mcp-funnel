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
import { getGeneratedLocation } from './session-source-maps.js';

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
    let metadata: ScriptMetadata | undefined;
    let scriptId: string;

    if (location.scriptId) {
      scriptId = location.scriptId;
      metadata = this.scripts.get(scriptId);
    } else if (location.url) {
      const reference = normalizeLocationReference(
        location.url,
        this.targetWorkingDirectory,
      );
      metadata = this.resolveScriptMetadata(reference);
      if (!metadata) {
        throw new Error(`No scriptId registered for url ${location.url}.`);
      }
      scriptId = metadata.scriptId;
    } else {
      throw new Error('Location must provide a scriptId or url.');
    }

    // If no source map, pass through as-is
    if (!metadata?.sourceMap) {
      return {
        scriptId,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber,
      };
    }

    // Find the source ID in the source map
    let sourceId: string | undefined;
    if (location.url) {
      const reference = normalizeLocationReference(
        location.url,
        this.targetWorkingDirectory,
      );
      if (
        reference.path &&
        metadata.sourceMap.sourcesByPath.has(reference.path)
      ) {
        sourceId = metadata.sourceMap.sourcesByPath.get(reference.path);
      } else if (
        reference.fileUrl &&
        metadata.sourceMap.sourcesByFileUrl?.has(reference.fileUrl)
      ) {
        sourceId = metadata.sourceMap.sourcesByFileUrl.get(reference.fileUrl);
      }
    }

    // If we can't find the source ID, fall back to as-is
    if (!sourceId) {
      return {
        scriptId,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber,
      };
    }

    // Convert from TypeScript (original) to JavaScript (generated) coordinates
    const generatedLocation = getGeneratedLocation(
      metadata.sourceMap.consumer,
      sourceId,
      location.lineNumber + 1, // Convert to 1-based for source-map
      location.columnNumber ?? 0,
    );

    if (!generatedLocation) {
      // Fall back to original coordinates
      return {
        scriptId,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber,
      };
    }

    return {
      scriptId,
      lineNumber: generatedLocation.lineNumber,
      columnNumber: generatedLocation.columnNumber,
    };
  }

  public fromCdpLocation(location: CdpLocation): BreakpointLocation {
    const metadata = this.scripts.get(location.scriptId);

    // If no source map, return as-is
    if (!metadata?.sourceMap) {
      return {
        scriptId: location.scriptId,
        url: metadata?.url,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber,
      };
    }

    // Translate from JavaScript (generated) coordinates to TypeScript (original) coordinates
    const originalPosition = metadata.sourceMap.consumer.originalPositionFor({
      line: location.lineNumber + 1,
      column: location.columnNumber ?? 0,
    });

    // If source map lookup fails, fall back to original coordinates
    if (!originalPosition.line) {
      return {
        scriptId: location.scriptId,
        url: metadata.url,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber,
      };
    }

    return {
      scriptId: location.scriptId,
      url: metadata.url,
      lineNumber: originalPosition.line - 1, // Convert back to 0-based
      columnNumber: originalPosition.column ?? 0,
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

  public getBreakpointRecord(id: string): BreakpointRecord | undefined {
    return this.breakpointRecords.get(id);
  }
}
