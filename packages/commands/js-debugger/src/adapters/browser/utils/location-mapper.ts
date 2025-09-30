import { classifyOrigin, toRelativePath } from '../../../utils/locations.js';
import type { DebugLocation, CodeOrigin } from '../../../types/index.js';
import type { CDPCallFrame } from '../../../cdp/index.js';

/**
 * Converts a URL to a file path for display
 */
export function urlToFilePath(url: string): string {
  if (url.startsWith('file://')) {
    return url.slice(7);
  }
  return url;
}

/**
 * Creates a DebugLocation from a CDP call frame
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
 * Provides a human-readable description of code origin
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
 * Maps CDP pause reasons to our debug state reasons
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
