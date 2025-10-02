import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SourceMapConsumer } from 'source-map';
import type {
  BasicSourceMapConsumer,
  NullablePosition,
  RawSourceMap,
} from 'source-map';

import type { ScriptMetadata, ScriptSourceMap } from '../types/index.js';
import type { GeneratedLocation } from './session-types.js';

/**
 * Creates a source map from a source map URL.
 * @param metadata
 * @param sourceMapUrl
 * @param targetWorkingDirectory
 */
export async function createSourceMap(
  metadata: ScriptMetadata,
  sourceMapUrl: string,
  targetWorkingDirectory: string,
): Promise<ScriptSourceMap | undefined> {
  const raw = await parseSourceMap(sourceMapUrl);
  if (!raw) {
    return undefined;
  }
  const consumer = (await new SourceMapConsumer(raw)) as BasicSourceMapConsumer;
  const sourcesByPath = new Map<string, string>();
  const sourcesByFileUrl = new Map<string, string>();
  const scriptDir = metadata.normalizedPath
    ? path.dirname(metadata.normalizedPath)
    : undefined;
  const sourceRoot = resolveSourceRoot(
    raw.sourceRoot,
    scriptDir,
    targetWorkingDirectory,
  );

  for (const sourceId of consumer.sources) {
    const normalized = normalizeSourcePath(
      sourceId,
      sourceRoot,
      scriptDir,
      targetWorkingDirectory,
    );
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
 * @param url
 */
export async function parseSourceMap(
  url: string,
): Promise<RawSourceMap | undefined> {
  if (url.startsWith('data:')) {
    return decodeDataUrlSourceMap(url);
  }
  console.warn(`External source map URLs are not supported yet (${url}).`);
  return undefined;
}

/**
 * Decodes a data URL source map.
 * @param dataUrl
 */
export function decodeDataUrlSourceMap(
  dataUrl: string,
): RawSourceMap | undefined {
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
 * @param sourceRoot
 * @param scriptDir
 * @param targetWorkingDirectory
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
 * @param source
 * @param sourceRoot
 * @param scriptDir
 * @param targetWorkingDirectory
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
 * @param value
 */
export function hasUriScheme(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/.test(value);
}

/**
 * Converts a nullable position to a generated location.
 * @param position
 */
export function toGeneratedLocation(
  position: NullablePosition,
): GeneratedLocation | undefined {
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
 * @param consumer
 * @param sourceId
 * @param originalLine
 * @param originalColumn
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
 * @param consumer
 * @param sourceId
 * @param originalLine
 * @param originalColumn
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
    .filter(
      (location): location is GeneratedLocation => location !== undefined,
    );
}

/**
 * Gets the best generated location for a source position.
 * @param consumer
 * @param sourceId
 * @param originalLine
 * @param originalColumn
 */
export function getGeneratedLocation(
  consumer: BasicSourceMapConsumer,
  sourceId: string,
  originalLine: number,
  originalColumn: number,
): GeneratedLocation | undefined {
  const direct = lookupGeneratedPosition(
    consumer,
    sourceId,
    originalLine,
    originalColumn,
  );
  if (direct) {
    return direct;
  }

  const candidates = collectGeneratedCandidates(
    consumer,
    sourceId,
    originalLine,
    originalColumn,
  );
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
