import type { BasicSourceMapConsumer, RawSourceMap } from 'source-map';

/**
 * Source map parsing output retained for follow-up breakpoint translations.
 */
export interface ScriptSourceMap {
  /** Raw source map payload decoded from the inline data URI. */
  map: RawSourceMap;
  /** Pre-parsed consumer used to translate original positions. */
  consumer: BasicSourceMapConsumer;
  /** Lookup table from normalised absolute paths to source identifiers. */
  sourcesByPath: Map<string, string>;
  /** Optional lookup table using file URLs for callers that prefer them. */
  sourcesByFileUrl?: Map<string, string>;
}

/**
 * Aggregated metadata describing a script reported by `Debugger.scriptParsed`.
 */
export interface ScriptMetadata {
  /** Unique identifier assigned by the debugger protocol. */
  scriptId: string;
  /** Raw URL value surfaced by CDP. */
  url?: string;
  /** Normalised absolute filesystem path when derivable. */
  normalizedPath?: string;
  /** Normalised `file://` representation matching the path above. */
  fileUrl?: string;
  /** Source map URL associated with the script, if any. */
  sourceMapUrl?: string;
  /** Parsed inline source map used for breakpoint translation. */
  sourceMap?: ScriptSourceMap;
  /** Internal promise tracking in-flight sourcemap parsing. */
  sourceMapPromise?: Promise<ScriptSourceMap | undefined>;
}
