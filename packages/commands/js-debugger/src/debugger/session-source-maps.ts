import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SourceMapConsumer } from 'source-map';
import type { BasicSourceMapConsumer, NullablePosition, RawSourceMap } from 'source-map';

import type { ScriptMetadata, ScriptSourceMap } from '../types/index.js';
import {
  loadFilePathSourceMap,
  loadFileSourceMap,
  loadHttpSourceMap,
  sourceMapCache,
} from './session-source-map-loaders.js';
import type { GeneratedLocation } from './session-types.js';

/**
 * Creates a source map from a source map URL.
 *
 * @param metadata - Script metadata containing path information
 * @param sourceMapUrl - URL pointing to the source map file
 * @param targetWorkingDirectory - Working directory for resolving relative paths
 * @returns Promise resolving to script source map or undefined if parsing fails
 *
 * @public
 */
export async function createSourceMap(
  metadata: ScriptMetadata,
  sourceMapUrl: string,
  targetWorkingDirectory: string,
): Promise<ScriptSourceMap | undefined> {
  const scriptDir = metadata.normalizedPath ? path.dirname(metadata.normalizedPath) : undefined;
  const raw = await parseSourceMap(sourceMapUrl, scriptDir);
  if (!raw) {
    return undefined;
  }
  const consumer = (await new SourceMapConsumer(raw)) as BasicSourceMapConsumer;
  const sourcesByPath = new Map<string, string>();
  const sourcesByFileUrl = new Map<string, string>();
  const sourceRoot = resolveSourceRoot(raw.sourceRoot, scriptDir, targetWorkingDirectory);

  for (const sourceId of consumer.sources) {
    const normalized = normalizeSourcePath(sourceId, sourceRoot, scriptDir, targetWorkingDirectory);
    if (normalized) {
      if (!sourcesByPath.has(normalized)) {
        sourcesByPath.set(normalized, sourceId);
      }
      try {
        const fileUrl = pathToFileURL(normalized).href;
        if (!sourcesByFileUrl.has(fileUrl)) {
          sourcesByFileUrl.set(fileUrl, sourceId);
        }
      } catch {
        // ignore conversion failures
      }
    }
    if (sourceId.startsWith('file://') && !sourcesByFileUrl.has(sourceId)) {
      sourcesByFileUrl.set(sourceId, sourceId);
    }
  }

  return {
    map: raw,
    consumer,
    sourcesByPath,
    sourcesByFileUrl: sourcesByFileUrl.size > 0 ? sourcesByFileUrl : undefined,
  };
}

/**
 * Parses a source map from a URL.
 *
 * @param url - URL to fetch the source map from (supports data:, file://, http://, https://, and file paths)
 * @param scriptDir - Optional directory to resolve relative paths against
 * @returns Promise resolving to raw source map or undefined if loading fails
 *
 * @public
 */
export async function parseSourceMap(
  url: string,
  scriptDir?: string,
): Promise<RawSourceMap | undefined> {
  if (sourceMapCache.has(url)) {
    return sourceMapCache.get(url);
  }

  let rawSourceMap: RawSourceMap | undefined;

  if (url.startsWith('data:')) {
    rawSourceMap = decodeDataUrlSourceMap(url);
  } else if (url.startsWith('file://')) {
    rawSourceMap = await loadFileSourceMap(url);
  } else if (url.startsWith('http://') || url.startsWith('https://')) {
    rawSourceMap = await loadHttpSourceMap(url);
  } else if (!hasUriScheme(url)) {
    rawSourceMap = await loadFilePathSourceMap(url, scriptDir);
  } else {
    console.warn(`Unsupported source map URL scheme (${url})`);
    return undefined;
  }

  if (rawSourceMap) {
    sourceMapCache.set(url, rawSourceMap);
  }

  return rawSourceMap;
}

/**
 * Decodes a data URL source map.
 *
 * @param dataUrl - Data URL containing base64 or URL-encoded source map
 * @returns Raw source map or undefined if invalid format
 * @throws Error When decoding fails or JSON is malformed
 *
 * @public
 */
export function decodeDataUrlSourceMap(dataUrl: string): RawSourceMap | undefined {
  const commaIndex = dataUrl.indexOf(',');
  if (commaIndex === -1) {
    return undefined;
  }
  const metadata = dataUrl.slice(5, commaIndex);
  const payload = dataUrl.slice(commaIndex + 1);
  const isBase64 = /;base64/i.test(metadata);
  try {
    const json = isBase64
      ? Buffer.from(payload, 'base64').toString('utf8')
      : decodeURIComponent(payload);
    return JSON.parse(json) as RawSourceMap;
  } catch (error) {
    throw new Error(
      `Failed to decode inline source map: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Resolves the source root directory.
 *
 * @param sourceRoot - Source root from source map (may be file:// URL or relative path)
 * @param scriptDir - Directory containing the script file
 * @param targetWorkingDirectory - Fallback directory for resolving relative paths
 * @returns Resolved absolute path to source root or undefined
 *
 * @public
 */
export function resolveSourceRoot(
  sourceRoot: string | undefined,
  scriptDir: string | undefined,
  targetWorkingDirectory: string,
): string | undefined {
  if (!sourceRoot) {
    return scriptDir;
  }
  if (sourceRoot.startsWith('file://')) {
    try {
      return path.normalize(fileURLToPath(sourceRoot));
    } catch {
      return scriptDir;
    }
  }
  if (path.isAbsolute(sourceRoot)) {
    return path.normalize(sourceRoot);
  }
  if (!hasUriScheme(sourceRoot)) {
    if (scriptDir) {
      return path.normalize(path.resolve(scriptDir, sourceRoot));
    }
    return path.normalize(path.resolve(targetWorkingDirectory, sourceRoot));
  }
  return scriptDir;
}

/**
 * Normalizes a source path to an absolute file system path.
 *
 * @param source - Source path from source map (may be relative, absolute, or file:// URL)
 * @param sourceRoot - Resolved source root directory
 * @param scriptDir - Directory containing the script file
 * @param targetWorkingDirectory - Fallback directory for resolving relative paths
 * @returns Normalized absolute path or undefined if path has unsupported URI scheme
 *
 * @public
 */
export function normalizeSourcePath(
  source: string,
  sourceRoot: string | undefined,
  scriptDir: string | undefined,
  targetWorkingDirectory: string,
): string | undefined {
  try {
    if (source.startsWith('file://')) {
      return path.normalize(fileURLToPath(source));
    }
  } catch {
    return undefined;
  }

  if (path.isAbsolute(source)) {
    return path.normalize(source);
  }

  if (hasUriScheme(source)) {
    return undefined;
  }

  if (sourceRoot) {
    return path.normalize(path.resolve(sourceRoot, source));
  }
  if (scriptDir) {
    return path.normalize(path.resolve(scriptDir, source));
  }
  return path.normalize(path.resolve(targetWorkingDirectory, source));
}

/**
 * Checks if a string has a URI scheme.
 *
 * @param value - String to check for URI scheme
 * @returns True if string has a URI scheme (e.g., "http://", "file://")
 *
 * @public
 */
export function hasUriScheme(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
}

/**
 * Converts a nullable position to a generated location.
 *
 * @param position - Nullable position from source map consumer
 * @returns Generated location with 0-based line numbers or undefined if no line
 *
 * @public
 */
export function toGeneratedLocation(position: NullablePosition): GeneratedLocation | undefined {
  if (!position.line) {
    return undefined;
  }
  return {
    lineNumber: Math.max(0, position.line - 1),
    columnNumber: position.column ?? 0,
  };
}

/**
 * Looks up a generated position from a source map.
 *
 * @param consumer - Source map consumer for position lookup
 * @param sourceId - Source file identifier in the source map
 * @param originalLine - Original line number (1-based)
 * @param originalColumn - Original column number (0-based)
 * @returns Generated location or undefined if no mapping found
 *
 * @public
 */
export function lookupGeneratedPosition(
  consumer: BasicSourceMapConsumer,
  sourceId: string,
  originalLine: number,
  originalColumn: number,
): GeneratedLocation | undefined {
  const lowerBound = consumer.generatedPositionFor({
    source: sourceId,
    line: originalLine,
    column: originalColumn,
    bias: SourceMapConsumer.GREATEST_LOWER_BOUND,
  });
  if (lowerBound.line) {
    return {
      lineNumber: Math.max(0, lowerBound.line - 1),
      columnNumber: lowerBound.column ?? 0,
    };
  }
  const upperBound = consumer.generatedPositionFor({
    source: sourceId,
    line: originalLine,
    column: originalColumn,
    bias: SourceMapConsumer.LEAST_UPPER_BOUND,
  });
  if (upperBound.line) {
    return {
      lineNumber: Math.max(0, upperBound.line - 1),
      columnNumber: upperBound.column ?? 0,
    };
  }
  return undefined;
}

/**
 * Collects all generated position candidates for a source location.
 *
 * @param consumer - Source map consumer for position lookup
 * @param sourceId - Source file identifier in the source map
 * @param originalLine - Original line number (1-based)
 * @param originalColumn - Original column number (0-based)
 * @returns Array of all matching generated locations
 *
 * @public
 */
export function collectGeneratedCandidates(
  consumer: BasicSourceMapConsumer,
  sourceId: string,
  originalLine: number,
  originalColumn: number,
): GeneratedLocation[] {
  const direct = consumer.allGeneratedPositionsFor({
    source: sourceId,
    line: originalLine,
    column: originalColumn,
  });
  const positions =
    direct.length > 0
      ? direct
      : consumer.allGeneratedPositionsFor({
          source: sourceId,
          line: originalLine,
          column: 0,
        });
  return positions
    .map((position) => toGeneratedLocation(position))
    .filter((location): location is GeneratedLocation => location !== undefined);
}

/**
 * Gets the best generated location for a source position.
 *
 * @param consumer - Source map consumer for position lookup
 * @param sourceId - Source file identifier in the source map
 * @param originalLine - Original line number (1-based)
 * @param originalColumn - Original column number (0-based)
 * @returns Best matching generated location or undefined if no mapping found
 *
 * @public
 */
export function getGeneratedLocation(
  consumer: BasicSourceMapConsumer,
  sourceId: string,
  originalLine: number,
  originalColumn: number,
): GeneratedLocation | undefined {
  const direct = lookupGeneratedPosition(consumer, sourceId, originalLine, originalColumn);
  if (direct) {
    return direct;
  }

  const candidates = collectGeneratedCandidates(consumer, sourceId, originalLine, originalColumn);
  if (candidates.length === 0) {
    return undefined;
  }
  const best = candidates.reduce((winner, current) => {
    if (!winner) {
      return current;
    }
    if (current.lineNumber !== winner.lineNumber) {
      return current.lineNumber < winner.lineNumber ? current : winner;
    }
    if (current.columnNumber === undefined) {
      return winner;
    }
    if (winner.columnNumber === undefined) {
      return current;
    }
    return current.columnNumber < winner.columnNumber ? current : winner;
  });
  return best;
}
