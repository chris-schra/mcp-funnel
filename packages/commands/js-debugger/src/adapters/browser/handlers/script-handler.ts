import type { CDPScriptParsedParams } from '../../../cdp/index.js';
import type { SourceMapConsumer } from 'source-map';

export interface ScriptInfo {
  url: string;
  source?: string;
  sourceMap?: SourceMapConsumer;
}

/**
 * Context for script handling operations
 */
export interface ScriptHandlerContext {
  scripts: Map<string, ScriptInfo>;
}

/**
 * Handles script parsed event
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
 * Load source map for a script
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
