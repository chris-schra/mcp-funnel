import type { CDPScriptParsedParams } from '../../../cdp/index.js';
import type { SourceMapConsumer } from 'source-map';

/**
 * Metadata for a parsed script tracked during browser debugging.
 * @internal
 */
export interface ScriptInfo {
  /** Script URL or file path as reported by the browser */
  url: string;
  /** Optional script source code (loaded on demand) */
  source?: string;
  /** Optional source map for mapping transpiled code to original sources */
  sourceMap?: SourceMapConsumer;
}

/**
 * Context for script handling operations providing access to the script registry.
 * @internal
 */
export interface ScriptHandlerContext {
  /** Map of script IDs to their metadata and source maps */
  scripts: Map<string, ScriptInfo>;
}

/**
 * Handles CDP Debugger.scriptParsed event to track loaded scripts.
 *
 * Registers the script in the context's script registry and initiates source map
 * loading if a source map URL is provided. Source map loading is asynchronous
 * and best-effort - failures are logged but do not prevent script registration.
 * @param params - CDP script parsed event parameters containing script metadata
 * @param context - Script handling context providing access to the script registry
 * @internal
 * @see file:../event-handlers.ts:247 - Usage in browser event handler
 */
export function handleScriptParsed(
  params: CDPScriptParsedParams,
  context: ScriptHandlerContext,
): void {
  context.scripts.set(params.scriptId, {
    url: params.url,
    sourceMap: undefined, // Will be loaded if needed
  });

  // Load source map if available
  if (params.sourceMapURL) {
    loadSourceMap(params.scriptId, params.sourceMapURL, context).catch(
      (error) => {
        console.warn(`Failed to load source map for ${params.url}:`, error);
      },
    );
  }
}

/**
 * Loads and attaches a source map to a script for source-level debugging.
 *
 * Supports multiple source map formats:
 * - Data URIs (base64-encoded source maps embedded in the script)
 * - HTTP/HTTPS URLs (fetched using Node.js built-in fetch if available)
 * - Relative URLs (currently skipped as they require browser-specific resolution)
 *
 * Source map loading is best-effort. Failures are logged as warnings but do not
 * throw errors, allowing debugging to continue without source maps.
 * @param scriptId - Unique identifier of the script to attach the source map to
 * @param sourceMapURL - URL or data URI pointing to the source map
 * @param context - Script handling context containing the script registry
 * @throws Never throws - all errors are caught and logged
 * @remarks
 * HTTP source maps are only loaded if `globalThis.fetch` is available (Node.js 18+).
 * Relative URLs are not supported in the browser debugging context and are silently skipped.
 * @internal
 * @see file:./script-handler.ts:38 - Called from handleScriptParsed
 */
export async function loadSourceMap(
  scriptId: string,
  sourceMapURL: string,
  context: ScriptHandlerContext,
): Promise<void> {
  try {
    // Handle relative URLs and data URLs
    let sourceMapContent: string;

    if (sourceMapURL.startsWith('data:')) {
      // Data URL
      const base64Data = sourceMapURL.split(',')[1];
      sourceMapContent = Buffer.from(base64Data, 'base64').toString('utf-8');
    } else if (sourceMapURL.startsWith('http')) {
      // Absolute URL - try to use built-in fetch or skip
      try {
        // Use Node.js built-in fetch (Node 18+) if available
        if (typeof globalThis.fetch === 'function') {
          const response = await globalThis.fetch(sourceMapURL);
          sourceMapContent = await response.text();
        } else {
          // Skip HTTP source maps if fetch is not available
          console.warn(
            `HTTP source map skipped (no fetch available): ${sourceMapURL}`,
          );
          return;
        }
      } catch (fetchError) {
        console.warn(
          `Failed to fetch source map from ${sourceMapURL}:`,
          fetchError,
        );
        return;
      }
    } else {
      // Relative path - this is tricky in browser context
      // For now, skip relative source maps
      return;
    }

    const sourceMapData = JSON.parse(sourceMapContent);
    // Dynamic import to avoid bundling issues
    const { SourceMapConsumer } = await import('source-map');
    const sourceMap = await new SourceMapConsumer(sourceMapData);
    const script = context.scripts.get(scriptId);
    if (script) {
      script.sourceMap = sourceMap;
    }
  } catch (error) {
    // Source map loading is best-effort
    console.warn(`Failed to load source map ${sourceMapURL}:`, error);
  }
}
