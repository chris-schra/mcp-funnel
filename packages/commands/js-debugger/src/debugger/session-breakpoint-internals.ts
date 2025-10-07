import type {
  BreakpointLocation,
  BreakpointSpec,
  BreakpointSummary,
  ScriptMetadata,
} from '../types/index.js';
import type {
  BreakpointRecord,
  CdpLocation,
  GeneratedLocation,
  NormalizedScriptReference,
  PendingBreakpointUpgrade,
} from './session-types.js';
import { getGeneratedLocation } from './session-source-maps.js';
import {
  buildMetadataKeys,
  buildReferenceKeys,
  resolveSourceIdentifier,
} from './session-breakpoints.js';

/**
 * Internal helper for breakpoint operations.
 * Handles complex breakpoint registration and upgrade logic.
 */
export class SessionBreakpointInternals {
  public constructor(
    private readonly sessionId: string,
    private readonly sendCommand: <T = unknown>(
      method: string,
      params?: Record<string, unknown>,
    ) => Promise<T>,
    private readonly breakpointRecords: Map<string, BreakpointRecord>,
    private readonly pendingBreakpointUpgrades: Map<
      string,
      PendingBreakpointUpgrade
    >,
    private readonly pendingBreakpointKeys: Map<string, Set<string>>,
    private readonly fromCdpLocation: (
      location: CdpLocation,
    ) => BreakpointLocation,
  ) {}

  public async registerBreakpointByUrl(
    spec: BreakpointSpec,
  ): Promise<BreakpointSummary> {
    const result = (await this.sendCommand('Debugger.setBreakpointByUrl', {
      url: spec.location.url,
      lineNumber: spec.location.lineNumber,
      columnNumber: spec.location.columnNumber,
      condition: spec.condition,
    })) as {
      breakpointId: string;
      locations: CdpLocation[];
    };
    const resolved = result.locations.map((location) =>
      this.fromCdpLocation(location),
    );
    const summary: BreakpointSummary = {
      id: result.breakpointId,
      requested: spec,
      resolvedLocations: resolved,
    };
    this.breakpointRecords.set(result.breakpointId, {
      id: result.breakpointId,
      cdpId: result.breakpointId,
      spec,
      resolved,
    });
    if (resolved.length === 0) {
      console.warn(
        `Session ${this.sessionId}: Breakpoint ${result.breakpointId} is pending resolution for ${spec.location.url}:${spec.location.lineNumber}.`,
      );
    }
    return summary;
  }

  public async registerBreakpointForScript(
    metadata: ScriptMetadata,
    spec: BreakpointSpec,
    reference: NormalizedScriptReference,
  ): Promise<BreakpointSummary> {
    const sourceMap = metadata.sourceMap;
    if (sourceMap && spec.location.url) {
      const sourceId = resolveSourceIdentifier(sourceMap, reference);
      if (sourceId) {
        const originalLine = spec.location.lineNumber + 1;
        const originalColumn = spec.location.columnNumber ?? 0;
        const generated = getGeneratedLocation(
          sourceMap.consumer,
          sourceId,
          originalLine,
          originalColumn,
        );
        if (generated) {
          const snapped = await this.snapToValidBreakpoint(
            metadata.scriptId,
            generated,
          );
          if (snapped) {
            return this.setBreakpointAtGeneratedLocation(
              metadata.scriptId,
              snapped,
              spec,
            );
          } else {
            console.warn(
              `Session ${this.sessionId}: Could not snap to valid breakpoint at ${metadata.scriptId}:${generated.lineNumber}:${generated.columnNumber ?? 0}`,
            );
          }
        } else {
          console.warn(
            `Session ${this.sessionId}: No source map mapping found for ${sourceId}:${originalLine}:${originalColumn}`,
          );
        }
      }
    }

    if (spec.location.url) {
      console.warn(
        `Session ${this.sessionId}: Falling back to Debugger.setBreakpointByUrl for ${spec.location.url}:${spec.location.lineNumber}.`,
      );
      const summary = await this.registerBreakpointByUrl(spec);
      this.trackPendingUpgrade(summary.id, reference);
      return summary;
    }

    throw new Error(
      'Unable to register breakpoint by scriptId without a source URL.',
    );
  }

  public async setBreakpointAtGeneratedLocation(
    scriptId: string,
    location: GeneratedLocation,
    spec: BreakpointSpec,
  ): Promise<BreakpointSummary> {
    const result = (await this.sendCommand('Debugger.setBreakpoint', {
      location: {
        scriptId,
        lineNumber: location.lineNumber,
        columnNumber: location.columnNumber,
      },
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

  public async snapToValidBreakpoint(
    scriptId: string,
    desired: GeneratedLocation,
  ): Promise<GeneratedLocation | undefined> {
    const start = {
      scriptId,
      lineNumber: desired.lineNumber,
      columnNumber: Math.max(0, desired.columnNumber ?? 0),
    };
    const end = {
      scriptId,
      lineNumber: desired.lineNumber + 1,
      columnNumber: 0,
    };
    try {
      const response = (await this.sendCommand(
        'Debugger.getPossibleBreakpoints',
        {
          start,
          end,
          restrictToFunction: false,
        },
      )) as {
        locations: Array<{
          scriptId: string;
          lineNumber: number;
          columnNumber?: number;
        }>;
      };

      if (!response.locations || response.locations.length === 0) {
        return desired;
      }

      const sameLine = response.locations.filter(
        (location) => location.lineNumber === desired.lineNumber,
      );
      const candidates = sameLine.length > 0 ? sameLine : response.locations;
      const sorted = [...candidates].sort((a, b) => {
        if (a.lineNumber !== b.lineNumber) {
          return a.lineNumber - b.lineNumber;
        }
        const colA = a.columnNumber ?? 0;
        const colB = b.columnNumber ?? 0;
        return colA - colB;
      });
      const column = desired.columnNumber ?? 0;
      const match =
        sorted.find((location) => (location.columnNumber ?? 0) >= column) ??
        sorted[sorted.length - 1];
      return {
        lineNumber: match.lineNumber,
        columnNumber: match.columnNumber ?? 0,
      };
    } catch (error) {
      console.warn(
        `Session ${this.sessionId}: Failed to snap breakpoint for ${scriptId}:${desired.lineNumber}:${desired.columnNumber ?? 0} (${error instanceof Error ? error.message : String(error)}).`,
      );
      return desired;
    }
  }

  public trackPendingUpgrade(
    recordId: string,
    reference: NormalizedScriptReference,
  ): void {
    const keys = buildReferenceKeys(reference);
    if (keys.length === 0) {
      return;
    }
    this.clearPendingUpgrade(recordId);
    const upgrade: PendingBreakpointUpgrade = {
      recordId,
      reference,
      keys,
    };
    this.pendingBreakpointUpgrades.set(recordId, upgrade);
    for (const key of keys) {
      const set = this.pendingBreakpointKeys.get(key) ?? new Set<string>();
      set.add(recordId);
      this.pendingBreakpointKeys.set(key, set);
    }
  }

  public clearPendingUpgrade(recordId: string): void {
    const upgrade = this.pendingBreakpointUpgrades.get(recordId);
    if (!upgrade) {
      return;
    }
    for (const key of upgrade.keys) {
      const set = this.pendingBreakpointKeys.get(key);
      if (!set) {
        continue;
      }
      set.delete(recordId);
      if (set.size === 0) {
        this.pendingBreakpointKeys.delete(key);
      }
    }
    this.pendingBreakpointUpgrades.delete(recordId);
  }

  public async upgradePendingBreakpoints(
    metadata: ScriptMetadata,
  ): Promise<void> {
    const keys = buildMetadataKeys(metadata);
    if (keys.length === 0) {
      return;
    }
    const recordIds = new Set<string>();
    for (const key of keys) {
      const set = this.pendingBreakpointKeys.get(key);
      if (!set) {
        continue;
      }
      for (const id of set) {
        recordIds.add(id);
      }
    }
    for (const id of recordIds) {
      const upgrade = this.pendingBreakpointUpgrades.get(id);
      if (!upgrade) {
        continue;
      }
      this.clearPendingUpgrade(id);
      try {
        await this.upgradeBreakpoint(metadata, upgrade);
      } catch (error) {
        console.warn(
          `Session ${this.sessionId}: Failed to upgrade breakpoint ${id}: ${
            error instanceof Error ? error.message : String(error)
          }.`,
        );
      }
    }
  }

  public async upgradeBreakpoint(
    metadata: ScriptMetadata,
    upgrade: PendingBreakpointUpgrade,
  ): Promise<void> {
    const record = this.breakpointRecords.get(upgrade.recordId);
    if (!record) {
      return;
    }
    if (!metadata.sourceMap || !record.spec.location.url) {
      return;
    }
    const sourceId = resolveSourceIdentifier(
      metadata.sourceMap,
      upgrade.reference,
    );
    if (!sourceId) {
      return;
    }
    const originalLine = record.spec.location.lineNumber + 1;
    const originalColumn = record.spec.location.columnNumber ?? 0;

    const generated = getGeneratedLocation(
      metadata.sourceMap.consumer,
      sourceId,
      originalLine,
      originalColumn,
    );
    if (!generated) {
      console.warn(
        `Session ${this.sessionId}: No source map mapping found for ${sourceId}:${originalLine}:${originalColumn}`,
      );
      return;
    }

    const snapped = await this.snapToValidBreakpoint(
      metadata.scriptId,
      generated,
    );
    if (!snapped) {
      console.warn(
        `Session ${this.sessionId}: Could not snap to valid breakpoint at ${metadata.scriptId}:${generated.lineNumber}:${generated.columnNumber ?? 0}`,
      );
      return;
    }

    const oldCdpId = record.cdpId;
    const result = (await this.sendCommand('Debugger.setBreakpoint', {
      location: {
        scriptId: metadata.scriptId,
        lineNumber: snapped.lineNumber,
        columnNumber: snapped.columnNumber,
      },
      condition: record.spec.condition,
    })) as {
      breakpointId: string;
      actualLocation: CdpLocation;
    };

    const resolvedLocation = this.fromCdpLocation(result.actualLocation);
    record.cdpId = result.breakpointId;
    record.resolved = [resolvedLocation];
    this.breakpointRecords.set(record.id, record);

    if (oldCdpId !== result.breakpointId) {
      try {
        await this.sendCommand('Debugger.removeBreakpoint', {
          breakpointId: oldCdpId,
        });
      } catch (error) {
        console.warn(
          `Session ${this.sessionId}: Failed to remove fallback breakpoint ${oldCdpId}: ${
            error instanceof Error ? error.message : String(error)
          }.`,
        );
      }
    }
    console.info(
      `Session ${this.sessionId}: Upgraded breakpoint ${record.id} to generated ${metadata.scriptId}:${resolvedLocation.lineNumber}:${resolvedLocation.columnNumber ?? 0}.`,
    );
  }
}
