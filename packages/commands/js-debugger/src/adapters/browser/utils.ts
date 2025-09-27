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
 * Convert file path to URL for browser context
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
 * Convert URL back to file path for display
 */
export function urlToFilePath(url: string): string {
  if (url.startsWith('file://')) {
    return url.slice(7);
  }
  return url;
}

/**
 * Build stack trace from call frames
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
 * Get variable scopes for a stack frame
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
