import type { BreakpointLocation } from '../types.js';

export interface CDPLocation {
  scriptId: string;
  lineNumber: number;
  columnNumber?: number;
}

export interface BreakpointLocationOptions {
  resolveScriptUrl: (scriptId: string) => string | undefined;
  convertScriptUrlToPath: (scriptUrl: string) => string;
  fallbackUrl?: string;
  onPathResolved?: (filePath: string) => void;
}

export function mapBreakpointLocations(
  locations: CDPLocation[] | undefined,
  options: BreakpointLocationOptions,
): BreakpointLocation[] {
  if (!locations || locations.length === 0) {
    return [];
  }

  return locations
    .map((location) => {
      const scriptUrl =
        options.resolveScriptUrl(location.scriptId) ||
        options.fallbackUrl ||
        '';
      const filePath = options.convertScriptUrlToPath(scriptUrl);

      if (!filePath) {
        return undefined;
      }

      options.onPathResolved?.(filePath);

      return {
        file: filePath,
        line: location.lineNumber + 1,
        column: location.columnNumber,
      } satisfies BreakpointLocation;
    })
    .filter((value): value is BreakpointLocation => Boolean(value));
}
