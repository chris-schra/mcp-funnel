import path from 'path';
import type { CodeOrigin, DebugRequest } from '../types/index.js';

/**
 * Configuration options for classifying code origin types.
 * @public
 * @see file:./locations.ts:16 - Used by classifyOrigin function
 */
export interface OriginClassifierOptions {
  /** Root directory of the project being debugged */
  projectRoot?: string;
  /** Custom predicates to identify internal/runtime code paths */
  internalMatchers?: Array<(normalizedPath: string) => boolean>;
  /** Custom predicates to identify library/dependency code paths */
  libraryMatchers?: Array<(normalizedPath: string) => boolean>;
  /** Treat absolute file paths as user code (defaults to false) */
  treatAbsoluteAsUser?: boolean;
}

/**
 * Classifies a file path into its code origin type for debugger display purposes.
 *
 * Determines whether a file belongs to user code, library code, internal runtime code,
 * or unknown sources. Classification is based on path patterns, custom matchers, and
 * the project root directory.
 *
 * Classification priority (first match wins):
 * 1. Undefined paths return 'internal'
 * 2. Paths matching custom internalMatchers return 'internal'
 * 3. Paths matching custom libraryMatchers return 'library'
 * 4. Paths within projectRoot return 'user'
 * 5. Absolute paths return 'user' if treatAbsoluteAsUser is true
 * 6. All other paths return 'unknown'
 * @param filePath - The file path to classify (may be undefined for runtime code)
 * @param options - Classification configuration including matchers and project root
 * @returns Code origin classification: 'user' \| 'internal' \| 'library' \| 'unknown'
 * @example
 * ```typescript
 * // Classify a node_modules file
 * const origin = classifyOrigin('/project/node_modules/lodash/index.js', {
 *   projectRoot: '/project',
 *   libraryMatchers: [(path) => path.includes('/node_modules/')],
 * });
 * // Returns: 'library'
 * ```
 * @example
 * ```typescript
 * // Classify browser extension code
 * const origin = classifyOrigin('chrome-extension://abc/script.js', {
 *   internalMatchers: [(path) => path.startsWith('chrome-extension:')],
 * });
 * // Returns: 'internal'
 * ```
 * @public
 * @see file:../types/debug-state.ts:1 - CodeOrigin type definition
 * @see file:../adapters/browser/utils.ts:110 - Usage in stack trace building
 * @see file:../adapters/browser/utils/location-mapper.ts:63 - Usage in location mapping
 */
export function classifyOrigin(
  filePath: string | undefined,
  options: OriginClassifierOptions,
): CodeOrigin {
  if (!filePath) {
    return 'internal';
  }

  const normalized = filePath.replace(/\\/g, '/');

  if (options.internalMatchers?.some((matcher) => matcher(normalized))) {
    return 'internal';
  }

  if (options.libraryMatchers?.some((matcher) => matcher(normalized))) {
    return 'library';
  }

  if (
    options.projectRoot &&
    normalized.startsWith(`${options.projectRoot.replace(/\\/g, '/')}/`)
  ) {
    return 'user';
  }

  if (options.treatAbsoluteAsUser) {
    if (normalized.startsWith('/')) {
      return 'user';
    }

    if (/^[A-Za-z]:\//.test(normalized)) {
      return 'user';
    }
  }

  return 'unknown';
}

/**
 * Converts an absolute file path to a project-relative path.
 *
 * Normalizes Windows backslashes to forward slashes and strips the project root
 * prefix when the file path is within the project directory. Returns undefined
 * if the path is outside the project or if required inputs are missing.
 * @param filePath - Absolute file path to convert
 * @param projectRoot - Root directory of the project
 * @returns Relative path from project root, or undefined if not within project
 * @example
 * ```typescript
 * toRelativePath('/project/src/app.ts', '/project')
 * // Returns: 'src/app.ts'
 *
 * toRelativePath('/other/file.ts', '/project')
 * // Returns: undefined
 * ```
 * @public
 * @see file:../adapters/browser/utils.ts:126 - Usage in stack frame building
 * @see file:../adapters/browser/utils/location-mapper.ts:84 - Usage in debug location creation
 */
export function toRelativePath(
  filePath: string | undefined,
  projectRoot?: string,
): string | undefined {
  if (!filePath || !projectRoot) {
    return undefined;
  }

  const normalizedRoot = projectRoot.replace(/\\/g, '/');
  const normalizedPath = filePath.replace(/\\/g, '/');

  if (normalizedPath.startsWith(`${normalizedRoot}/`)) {
    return normalizedPath.slice(normalizedRoot.length + 1);
  }

  return undefined;
}

/**
 * Infers the project root directory from a debug request.
 *
 * Attempts to determine the project root by examining the target script and breakpoint
 * file paths. Uses the first valid absolute file path found (after filtering out URLs
 * and relative paths) and returns its parent directory. This heuristic works for most
 * debug scenarios where the target or breakpoints reference project files.
 *
 * Search order:
 * 1. Debug target path (if it's a file path, not a URL)
 * 2. Breakpoint file paths (first valid one found)
 * @param request - Debug request containing target and breakpoint information
 * @returns Inferred project root directory path, or undefined if unable to determine
 * @example
 * ```typescript
 * const request: DebugRequest = {
 *   platform: 'node',
 *   target: '/Users/dev/project/src/index.ts',
 *   breakpoints: [{ file: '/Users/dev/project/src/app.ts', line: 10 }]
 * };
 * const root = deriveProjectRootFromRequest(request);
 * // Returns: '/Users/dev/project/src'
 * ```
 * @public
 * @see file:../types/request.ts:1 - DebugRequest interface definition
 * @see file:../adapters/browser-adapter.ts:120 - Usage in browser adapter initialization
 */
export function deriveProjectRootFromRequest(
  request?: DebugRequest,
): string | undefined {
  if (!request) {
    return undefined;
  }

  const candidates: string[] = [];
  if (request.target) {
    candidates.push(request.target);
  }
  if (request.breakpoints) {
    for (const bp of request.breakpoints) {
      candidates.push(bp.file);
    }
  }

  for (const candidate of candidates) {
    const resolved = normalizeCandidatePath(candidate);
    if (!resolved) {
      continue;
    }

    return path.dirname(resolved).replace(/\\/g, '/');
  }

  return undefined;
}

/**
 * Normalizes a candidate path string to an absolute file path.
 *
 * Filters out non-file URLs (ws://, http://, etc.) and converts file:// URLs
 * to file system paths. Only returns paths that are absolute after normalization.
 * Used internally to sanitize debug target and breakpoint paths.
 * @param candidate - Path string that may be a URL, file:// URI, or file path
 * @returns Normalized absolute file path, or undefined if not a valid file path
 * @internal
 * @see file:./locations.ts:163 - Used by deriveProjectRootFromRequest
 */
function normalizeCandidatePath(
  candidate: string | undefined,
): string | undefined {
  if (!candidate) {
    return undefined;
  }

  if (candidate.startsWith('ws://') || candidate.startsWith('wss://')) {
    return undefined;
  }

  if (candidate.startsWith('http://') || candidate.startsWith('https://')) {
    return undefined;
  }

  let filePath = candidate;

  if (candidate.startsWith('file://')) {
    try {
      filePath = new URL(candidate).pathname;
    } catch {
      return undefined;
    }
  }

  if (!path.isAbsolute(filePath)) {
    return undefined;
  }

  return path.resolve(filePath);
}
