import { classifyOrigin, toRelativePath } from '../../../utils/locations.js';
import type { DebugLocation, CodeOrigin } from '../../../types/index.js';
import type { CDPCallFrame } from '../../../cdp/index.js';

/**
 * Converts a URL to a file path for display.
 *
 * Strips the `file://` protocol prefix if present, otherwise returns the URL unchanged.
 * Used to convert CDP script URLs to displayable file paths.
 * @param url - URL string, typically from CDP call frames (e.g., 'file:///path/to/file.js' or 'http://localhost/app.js')
 * @returns File path with `file://` prefix removed, or original URL if not a file protocol
 * @example
 * ```typescript
 * urlToFilePath('file:///home/user/app.js')  // '/home/user/app.js'
 * urlToFilePath('http://localhost:3000/app.js')  // 'http://localhost:3000/app.js'
 * ```
 * @internal
 * @see file:./../../handlers/pause-handler.ts:106 - Usage in breakpoint location mapping
 */
export function urlToFilePath(url: string): string {
  if (url.startsWith('file://')) {
    return url.slice(7);
  }
  return url;
}

/**
 * Creates a DebugLocation from a CDP call frame.
 *
 * Transforms CDP call frame data into a structured debug location by:
 * - Converting the URL to a file path
 * - Classifying the code origin (user/library/internal/unknown)
 * - Computing relative path when project root is available
 * - Adjusting line numbers from 0-based (CDP) to 1-based (editor convention)
 * @param frame - CDP call frame containing location and URL information
 * @param projectRoot - Optional project root directory for computing relative paths and classifying user code
 * @returns Debug location object with classified origin and file information, or undefined for certain internal runtime cases
 * @remarks
 * Line numbers are converted from CDP's 0-based indexing to 1-based for consistency
 * with editor displays. Chrome extensions and node_modules are automatically classified
 * as internal and library code respectively.
 * @example
 * ```typescript
 * const location = createDebugLocation(callFrame, '/home/user/project');
 * // Returns: { type: 'user', file: '/home/user/project/app.js', line: 42, ... }
 * ```
 * @internal
 * @see file:./../../handlers/pause-handler.ts:94 - Usage in pause event handling
 * @see file:./../../../types/debug-state.ts:3 - DebugLocation interface definition
 */
export function createDebugLocation(
  frame: CDPCallFrame,
  projectRoot?: string,
): DebugLocation | undefined {
  const filePath = urlToFilePath(frame.url);
  const origin = classifyOrigin(filePath, {
    projectRoot,
    internalMatchers: [
      (normalized) => normalized.startsWith('chrome-extension:'),
    ],
    libraryMatchers: [(normalized) => normalized.includes('/node_modules/')],
    treatAbsoluteAsUser: true,
  });

  if (!filePath && origin === 'internal') {
    return {
      type: 'internal',
      description: 'Browser runtime code',
    };
  }

  return {
    type: origin,
    file: filePath || undefined,
    line: frame.location.lineNumber + 1,
    column: frame.location.columnNumber,
    relativePath: toRelativePath(filePath, projectRoot),
    description: describeOrigin(origin, filePath),
  };
}

/**
 * Provides a human-readable description of code origin.
 *
 * Generates user-friendly descriptions for different types of code locations:
 * - Internal: Browser runtime or extension code
 * - Library: Third-party dependencies (node_modules)
 * - User/Unknown: No description (undefined)
 * @param origin - Classified code origin type
 * @param filePath - File path used to provide context-specific descriptions for internal code
 * @returns Human-readable description for internal/library code, undefined for user/unknown code
 * @example
 * ```typescript
 * describeOrigin('internal', 'chrome-extension://abc/script.js')  // 'Browser extension script'
 * describeOrigin('library', '/project/node_modules/lib/index.js')  // 'Dependency code (node_modules)'
 * describeOrigin('user', '/project/app.js')  // undefined
 * ```
 * @internal
 * @see file:./../../../types/debug-state.ts:1 - CodeOrigin type definition
 */
export function describeOrigin(
  origin: CodeOrigin,
  filePath: string,
): string | undefined {
  if (origin === 'internal') {
    if (filePath.startsWith('chrome-extension:')) {
      return 'Browser extension script';
    }
    return 'Browser runtime code';
  }

  if (origin === 'library') {
    return 'Dependency code (node_modules)';
  }

  return undefined;
}

/**
 * Maps CDP pause reasons to normalized debug state pause reasons.
 *
 * Chrome DevTools Protocol has many specific pause reasons that are consolidated
 * into a simplified set of categories for consistent handling across the debugger.
 * Unknown or unhandled CDP reasons default to 'entry'.
 * @param reason - CDP pause reason string from Debugger.paused events
 * @returns Normalized pause reason category
 * @remarks
 * The CDP reason 'debugCommand' and 'debuggerStatement' both map to 'debugger'
 * as they represent explicit debugging breaks (debugger statement or manual pause).
 * All other unrecognized reasons default to 'entry' as a safe fallback.
 * @example
 * ```typescript
 * mapPauseReason('breakpoint')  // 'breakpoint'
 * mapPauseReason('debuggerStatement')  // 'debugger'
 * mapPauseReason('XHR')  // 'entry' (fallback)
 * ```
 * @internal
 * @see file:./../../handlers/pause-handler.ts:89 - Usage in pause event handling
 * @see file:./../../../cdp/types.ts:52 - CDP pause reason enumeration
 * @see file:./../../../types/debug-state.ts:14 - DebugState pauseReason type
 */
export function mapPauseReason(
  reason: string,
): 'breakpoint' | 'step' | 'exception' | 'entry' | 'debugger' {
  switch (reason) {
    case 'breakpoint':
      return 'breakpoint';
    case 'step':
      return 'step';
    case 'exception':
      return 'exception';
    case 'debugCommand':
    case 'debuggerStatement':
      return 'debugger';
    default:
      return 'entry';
  }
}
