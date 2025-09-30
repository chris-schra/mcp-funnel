import { StackFrame, Scope, Variable } from '../../types/index.js';
import {
  CDPClient,
  CDPCallFrame,
  CDPGetPropertiesResult,
} from '../../cdp/index.js';
import { classifyOrigin, toRelativePath } from '../../utils/locations.js';

/**
 * Utility functions for browser adapter
 */

/**
 * Converts a file path to a URL format suitable for browser debugging contexts.
 *
 * Handles three input cases:
 * - Already a valid URL (http://, https://, file://) - returns as-is
 * - Absolute file path starting with '/' - converts to file:// URL
 * - Other paths - converts to file:// URL as fallback
 * @param filePath - File path or URL to convert (can be absolute path, relative path, or existing URL)
 * @returns URL string suitable for browser CDP commands (http://, https://, or file:// protocol)
 * @example
 * ```typescript
 * filePathToUrl('https://example.com/app.js'); // 'https://example.com/app.js'
 * filePathToUrl('/usr/local/project/main.js'); // 'file:///usr/local/project/main.js'
 * filePathToUrl('main.js'); // 'file://main.js'
 * ```
 * @internal
 */
export function filePathToUrl(filePath: string): string {
  // For browser debugging, we expect URLs rather than file paths
  // If it's already a URL, return as-is
  if (
    filePath.startsWith('http://') ||
    filePath.startsWith('https://') ||
    filePath.startsWith('file://')
  ) {
    return filePath;
  }

  // Convert relative paths to file:// URLs as fallback
  if (filePath.startsWith('/')) {
    return `file://${filePath}`;
  }

  return `file://${filePath}`;
}

/**
 * Converts a URL back to a file path for display purposes.
 *
 * Strips the 'file://' protocol prefix if present, otherwise returns the URL unchanged.
 * This is the inverse operation of filePathToUrl for file:// URLs.
 * @param url - URL string to convert (typically from CDP script URLs)
 * @returns File path with 'file://' prefix removed, or the original URL for http/https URLs
 * @example
 * ```typescript
 * urlToFilePath('file:///usr/local/project/main.js'); // '/usr/local/project/main.js'
 * urlToFilePath('https://example.com/app.js'); // 'https://example.com/app.js'
 * ```
 * @internal
 */
export function urlToFilePath(url: string): string {
  if (url.startsWith('file://')) {
    return url.slice(7);
  }
  return url;
}

/**
 * Builds a formatted stack trace from CDP call frames.
 *
 * Transforms raw Chrome DevTools Protocol call frames into our normalized StackFrame
 * format with origin classification, relative paths, and 1-based line numbers.
 * Classifies code origin as 'user', 'library' (node_modules), 'internal' (chrome-extension),
 * or 'unknown'.
 * @param currentCallFrames - Array of CDP call frames from Debugger.paused event, ordered from innermost (current) to outermost frame
 * @param projectRoot - Optional project root path for computing relative paths and classifying user code
 * @returns Array of normalized stack frames with file paths, line/column numbers, and origin metadata
 * @example
 * ```typescript
 * const frames = buildStackTrace(cdpCallFrames, '/path/to/project');
 * // Returns:
 * // [
 * //   { id: 0, functionName: 'myFunction', file: '/path/to/project/main.js',
 * //     line: 42, column: 10, origin: 'user', relativePath: 'main.js' },
 * //   { id: 1, functionName: 'require', file: '/node_modules/lib/index.js',
 * //     line: 10, origin: 'library', relativePath: undefined }
 * // ]
 * ```
 * @internal
 * @see file:../../types/evaluation.ts:1 - StackFrame interface definition
 * @see file:../../utils/locations.ts - classifyOrigin and toRelativePath utilities
 */
export function buildStackTrace(
  currentCallFrames: CDPCallFrame[],
  projectRoot?: string,
): StackFrame[] {
  return currentCallFrames.map((frame, index) => {
    const filePath = urlToFilePath(frame.url);
    const origin = classifyOrigin(filePath, {
      projectRoot,
      internalMatchers: [
        (normalized) => normalized.startsWith('chrome-extension:'),
      ],
      libraryMatchers: [(normalized) => normalized.includes('/node_modules/')],
      treatAbsoluteAsUser: true,
    });

    return {
      id: index,
      functionName: frame.functionName || '(anonymous)',
      file: filePath,
      line: frame.location.lineNumber + 1,
      column: frame.location.columnNumber,
      origin,
      relativePath: toRelativePath(filePath, projectRoot),
    } satisfies StackFrame;
  });
}

/**
 * Retrieves variable scopes for a specific call frame during debugging.
 *
 * Queries the Chrome DevTools Protocol to fetch all accessible scopes (local, closure,
 * global, etc.) for a given call frame. Each scope contains its variables with values,
 * types, and property descriptors. Maps CDP scope type 'script' to 'global' for consistency.
 *
 * This function inspects the scope chain top-to-bottom (local → closure → global)
 * and retrieves properties for each scope that has an objectId.
 * @param cdpClient - CDP client instance for communicating with the browser debugger
 * @param frame - CDP call frame to inspect (typically from Debugger.paused event)
 * @returns Promise resolving to array of scopes with their variables, ordered from innermost (local) to outermost (global)
 * @example
 * ```typescript
 * const scopes = await getFrameScopes(cdpClient, callFrames[0]);
 * // Returns:
 * // [
 * //   { type: 'local', name: undefined, variables: [
 * //       { name: 'x', value: 42, type: 'number', enumerable: true }
 * //   ]},
 * //   { type: 'global', name: 'Window', variables: [...] }
 * // ]
 * ```
 * @internal
 * @see file:../../types/evaluation.ts:15 - Scope and Variable interface definitions
 * @see file:../../cdp/types.ts:6 - CDPCallFrame interface with scopeChain
 */
export async function getFrameScopes(
  cdpClient: CDPClient,
  frame: CDPCallFrame,
): Promise<Scope[]> {
  const scopes: Scope[] = [];

  for (const scopeChain of frame.scopeChain) {
    if (!scopeChain.object.objectId) continue;

    try {
      const properties = await cdpClient.send<CDPGetPropertiesResult>(
        'Runtime.getProperties',
        { objectId: scopeChain.object.objectId, ownProperties: true },
      );

      const variables: Variable[] = properties.result.map((prop) => ({
        name: prop.name,
        value: prop.value.value,
        type: prop.value.type,
        configurable: prop.configurable,
        enumerable: prop.enumerable,
      }));

      const scopeType =
        scopeChain.type === 'script' ? 'global' : scopeChain.type;
      scopes.push({
        type: scopeType as Scope['type'],
        name: scopeChain.name,
        variables,
      });
    } catch (error) {
      console.warn(
        `Failed to get properties for scope ${scopeChain.type}:`,
        error,
      );
    }
  }

  return scopes;
}
