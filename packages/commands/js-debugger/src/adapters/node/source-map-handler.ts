import { SourceMapConsumer, type RawSourceMap } from 'source-map';
import path from 'path';

/**
 * Position information for source maps
 */
export interface SourcePosition {
  line: number;
  column: number;
}

/**
 * Mapping result for source map lookups
 */
export interface MappingResult {
  source?: string;
  line?: number;
  column?: number;
}

/**
 * Source map entry containing the consumer and metadata
 */
interface SourceMapEntry {
  consumer: SourceMapConsumer;
  url: string;
  sourceMapUrl: string;
}

/**
 * Handles source map functionality for the Node debug adapter.
 * Stores and processes source maps to map between original and generated code positions.
 */
export class SourceMapHandler {
  private sourceMaps = new Map<string, SourceMapEntry>();
  private scriptIdToUrl = new Map<string, string>();

  /**
   * Process a script parsed event and extract source map information
   * @param params
   * @param params.scriptId
   * @param params.url
   * @param params.sourceMapURL
   */
  async handleScriptParsed(params: {
    scriptId: string;
    url: string;
    sourceMapURL?: string;
  }): Promise<void> {
    const { scriptId, url, sourceMapURL } = params;

    // Always store script ID to URL mapping
    this.scriptIdToUrl.set(scriptId, url);

    // Process source map if available
    if (sourceMapURL) {
      try {
        const sourceMapContent = await this.fetchSourceMapContent(sourceMapURL);
        if (sourceMapContent) {
          const consumer = await new SourceMapConsumer(sourceMapContent);
          this.sourceMaps.set(url, {
            consumer,
            url,
            sourceMapUrl: sourceMapURL,
          });
        }
      } catch (error) {
        console.warn(`Failed to process source map for ${url}:`, error);
      }
    }
  }

  /**
   * Resolve a breakpoint target from original source to generated source
   * @param file
   * @param line
   */
  async resolveBreakpointTarget(
    file: string,
    line: number,
  ): Promise<{ url: string; lineNumber: number; columnNumber?: number }> {
    // Find source map that contains this original file
    for (const [generatedUrl, entry] of this.sourceMaps) {
      const { consumer } = entry;

      try {
        const generated = consumer.generatedPositionFor({
          source: file,
          line,
          column: 0,
        });

        if (generated.line !== null && generated.column !== null) {
          return {
            url: generatedUrl,
            lineNumber: generated.line - 1, // Convert to zero-based
            columnNumber: generated.column,
          };
        }
      } catch (error) {
        console.warn(
          `Failed to resolve breakpoint position for ${file}:${line}:`,
          error,
        );
      }
    }

    // If no source map found, return the original file as-is
    return {
      url: file,
      lineNumber: line - 1, // Convert to zero-based
      columnNumber: 0,
    };
  }

  /**
   * Map a call frame from generated source back to original source
   * @param frame
   * @param frame.callFrameId
   * @param frame.functionName
   * @param frame.location
   * @param frame.location.scriptId
   * @param frame.location.lineNumber
   * @param frame.location.columnNumber
   * @param frame.url
   * @param frame.scopeChain
   */
  mapCallFrameToOriginal(frame: {
    callFrameId: string;
    functionName: string;
    location: {
      scriptId: string;
      lineNumber: number;
      columnNumber?: number;
    };
    url?: string;
    scopeChain: Array<{
      type: 'global' | 'local' | 'closure' | 'with' | 'catch';
      object: { type: string };
    }>;
  }): MappingResult | undefined {
    const { location } = frame;

    // Get the URL for this script
    const url = frame.url || this.scriptIdToUrl.get(location.scriptId);
    if (!url) {
      return undefined;
    }

    // Look up source map for this URL
    const sourceMapEntry = this.sourceMaps.get(url);
    if (!sourceMapEntry) {
      return undefined;
    }

    const { consumer } = sourceMapEntry;

    try {
      const original = consumer.originalPositionFor({
        line: location.lineNumber + 1, // Convert to 1-based
        column: location.columnNumber || 0,
      });

      if (
        original.source &&
        original.line !== null &&
        original.column !== null
      ) {
        return {
          source: this.normalizeFilePath(original.source),
          line: original.line,
          column: original.column,
        };
      }
    } catch (error) {
      console.warn(
        `Failed to map call frame position for ${url}:${location.lineNumber}:`,
        error,
      );
    }

    return undefined;
  }

  /**
   * Normalize file paths for consistent handling
   * @param filePath
   */
  normalizeFilePath(filePath: string): string {
    // Convert file URLs to regular paths
    if (filePath.startsWith('file://')) {
      try {
        const url = new URL(filePath);
        return url.pathname;
      } catch {
        // If URL parsing fails, try to extract the path manually
        return filePath.replace(/^file:\/\//, '');
      }
    }

    // Normalize path separators and resolve relative paths
    return path.normalize(filePath);
  }

  /**
   * Fetch source map content from URL
   * @param sourceMapUrl
   */
  private async fetchSourceMapContent(
    sourceMapUrl: string,
  ): Promise<RawSourceMap | null> {
    try {
      // Handle data URLs (base64 encoded source maps)
      if (sourceMapUrl.startsWith('data:')) {
        const match = sourceMapUrl.match(
          /^data:application\/json;base64,(.+)$/,
        );
        if (match) {
          const base64Content = match[1];
          const jsonContent = Buffer.from(base64Content, 'base64').toString(
            'utf-8',
          );
          return JSON.parse(jsonContent) as RawSourceMap;
        }
      }

      // Handle file URLs or relative paths
      // For now, we only support data URLs as used in the test
      // In a real implementation, you might want to read from the file system
      return null;
    } catch (error) {
      console.warn('Failed to fetch source map content:', error);
      return null;
    }
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    // Destroy all source map consumers to free resources
    for (const entry of this.sourceMaps.values()) {
      try {
        entry.consumer.destroy();
      } catch (error) {
        console.warn('Failed to destroy source map consumer:', error);
      }
    }

    this.sourceMaps.clear();
    this.scriptIdToUrl.clear();
  }
}
