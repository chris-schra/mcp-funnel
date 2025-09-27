import path from 'path';
import type { CodeOrigin, DebugRequest } from '../types.js';

export interface OriginClassifierOptions {
  projectRoot?: string;
  internalMatchers?: Array<(normalizedPath: string) => boolean>;
  libraryMatchers?: Array<(normalizedPath: string) => boolean>;
  treatAbsoluteAsUser?: boolean;
}

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
