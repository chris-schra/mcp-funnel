import type { BreakpointLocation } from '../types/index.js';

/**
 * Chrome DevTools Protocol location representation.
 * Represents a location in the browser's script space using CDP's internal
 * script identifiers and 0-based line/column numbers.
 * @public
 * @see file:../types/breakpoint.ts:1 - BreakpointLocation for file system representation
 */
export interface CDPLocation {
  /** CDP script identifier (opaque string from Chrome/Node inspector) */
  scriptId: string;
  /** 0-based line number in the script */
  lineNumber: number;
  /** Optional 0-based column number */
  columnNumber?: number;
}

/**
 * Configuration for mapping CDP locations to file system paths.
 * Provides callbacks for script URL resolution and path conversion,
 * enabling the transformation from CDP's internal script references
 * to user-facing file paths.
 * @public
 * @see file:./breakpoints.ts:37 - mapBreakpointLocations usage
 */
export interface BreakpointLocationOptions {
  /** Resolves a CDP script ID to its source URL, returns undefined if unknown */
  resolveScriptUrl: (scriptId: string) => string | undefined;
  /** Converts a script URL (file://, http://, etc.) to an absolute file path */
  convertScriptUrlToPath: (scriptUrl: string) => string;
  /** Fallback URL when script resolution fails (typically the original request URL) */
  fallbackUrl?: string;
  /** Called for each successfully resolved file path (used for project root detection) */
  onPathResolved?: (filePath: string) => void;
}

/**
 * Transforms CDP breakpoint locations into file system locations.
 * Converts Chrome DevTools Protocol locations (which use opaque script IDs and
 * 0-based line numbers) into user-facing file paths with 1-based line numbers.
 * This mapping is essential for presenting debugger state in terms developers
 * understand rather than internal CDP representations.
 *
 * Key transformations:
 * - CDP 0-based line numbers → 1-based line numbers (editor convention)
 * - CDP script IDs → file:// URLs → absolute file paths
 * - Filters out locations that cannot be resolved to valid file paths
 * @param locations - CDP locations from Debugger.setBreakpoint response or pause events
 * @param options - Configuration for script resolution and path conversion
 * @returns Array of resolved breakpoint locations (empty if input is undefined/empty)
 * @example Browser breakpoint resolution
 * ```typescript
 * const resolvedLocations = mapBreakpointLocations(result.locations, {
 *   resolveScriptUrl: (scriptId) => scripts.get(scriptId)?.url,
 *   convertScriptUrlToPath: (scriptUrl) => urlToFilePath(scriptUrl),
 *   fallbackUrl: 'file:///project/src/main.ts',
 *   onPathResolved: (filePath) => {
 *     console.log(`Resolved breakpoint at ${filePath}`);
 *   },
 * });
 * ```
 * @public
 * @see file:../adapters/browser/breakpoint-manager.ts:89 - Usage in breakpoint setup
 * @see file:../adapters/browser/handlers/pause-handler.ts:104 - Usage during pause events
 * @see file:../types/breakpoint.ts:1 - BreakpointLocation output type
 */
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
