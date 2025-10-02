import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import type { ScriptMetadata, ScriptSourceMap } from '../types/index.js';
import type { NormalizedScriptReference } from './session-types.js';
import { hasUriScheme } from './session-source-maps.js';

/**
 * Normalizes a location reference (URL or path) to standard forms.
 * @param raw
 * @param targetWorkingDirectory
 */
export function normalizeLocationReference(
  raw: string,
  targetWorkingDirectory: string,
): NormalizedScriptReference {
  const trimmed = raw.trim();
  const reference: NormalizedScriptReference = { original: trimmed };
  if (!trimmed) {
    return reference;
  }

  let candidatePath: string | undefined;
  if (trimmed.startsWith('file://')) {
    try {
      candidatePath = fileURLToPath(trimmed);
    } catch {
      candidatePath = undefined;
    }
  } else if (path.isAbsolute(trimmed)) {
    candidatePath = trimmed;
  } else if (!hasUriScheme(trimmed)) {
    candidatePath = path.resolve(targetWorkingDirectory, trimmed);
  }

  if (candidatePath) {
    const normalized = path.normalize(candidatePath);
    reference.path = normalized;
    try {
      reference.fileUrl = pathToFileURL(normalized).href;
    } catch {
      reference.fileUrl = undefined;
    }
  } else if (trimmed.startsWith('file://')) {
    reference.fileUrl = trimmed;
  }

  return reference;
}

/**
 * Builds lookup keys for a script reference.
 * @param reference
 */
export function buildReferenceKeys(
  reference: NormalizedScriptReference,
): string[] {
  const keys = new Set<string>();
  if (reference.original) {
    keys.add(reference.original);
  }
  if (reference.path) {
    keys.add(reference.path);
  }
  if (reference.fileUrl) {
    keys.add(reference.fileUrl);
  }
  return Array.from(keys);
}

/**
 * Builds lookup keys for script metadata.
 * @param metadata
 */
export function buildMetadataKeys(metadata: ScriptMetadata): string[] {
  const keys = new Set<string>();
  if (metadata.url) {
    keys.add(metadata.url);
  }
  if (metadata.normalizedPath) {
    keys.add(metadata.normalizedPath);
  }
  if (metadata.fileUrl) {
    keys.add(metadata.fileUrl);
  }
  return Array.from(keys);
}

/**
 * Resolves a source identifier from a source map given a reference.
 * @param sourceMap
 * @param reference
 */
export function resolveSourceIdentifier(
  sourceMap: ScriptSourceMap,
  reference: NormalizedScriptReference,
): string | undefined {
  if (reference.path) {
    const source = sourceMap.sourcesByPath.get(reference.path);
    if (source) {
      return source;
    }
  }
  if (reference.fileUrl && sourceMap.sourcesByFileUrl?.has(reference.fileUrl)) {
    return sourceMap.sourcesByFileUrl.get(reference.fileUrl);
  }
  if (sourceMap.map.sources.includes(reference.original)) {
    return reference.original;
  }
  return undefined;
}
