import { satisfies } from 'semver';
import {
  resolveLocalModule,
  extractESLintCtor,
  isPrettierNS,
} from './module-resolver.js';

const COMPAT = {
  prettier: '>=3.0.0 <4.0.0',
  eslint: '>=9.0.0 <10.0.0',
  typescript: '>=5.0.0 <6.0.0',
} as const;

export interface LoadedTools {
  prettierMod?: typeof import('prettier');
  eslintCtor?: typeof import('eslint').ESLint;
  prettierLocal: { modulePath: string; version: string } | null;
  eslintLocal: { modulePath: string; version: string } | null;
}

/**
 * Loads Prettier module with local-first strategy
 * @param baseDirs - Directories to search for local module
 * @returns Prettier module and local info
 */
export async function loadPrettier(baseDirs: string[]): Promise<{
  mod?: typeof import('prettier');
  local: { modulePath: string; version: string } | null;
}> {
  let prettierLocal: { modulePath: string; version: string } | null = null;
  let prettierMod: typeof import('prettier') | undefined;

  try {
    prettierLocal = await resolveLocalModule('prettier', baseDirs);
    if (prettierLocal && satisfies(prettierLocal.version, COMPAT.prettier)) {
      try {
        const mod: unknown = await import(prettierLocal.modulePath);
        const direct = isPrettierNS(mod) ? mod : undefined;
        const fallbackDefault =
          !direct &&
          mod &&
          typeof (mod as { default?: unknown }).default !== 'undefined'
            ? (mod as { default?: unknown }).default
            : undefined;
        const chosen =
          direct ||
          (isPrettierNS(fallbackDefault) ? fallbackDefault : undefined);
        prettierMod = chosen;
      } catch (_e) {
        prettierMod = undefined;
      }
    }
  } catch (_e) {
    const _ignored = _e as unknown;
    void _ignored;
  }

  if (!prettierMod) {
    try {
      const mod: unknown = await import('prettier');
      const direct = isPrettierNS(mod) ? mod : undefined;
      const fallbackDefault =
        !direct &&
        mod &&
        typeof (mod as { default?: unknown }).default !== 'undefined'
          ? (mod as { default?: unknown }).default
          : undefined;
      const chosen =
        direct || (isPrettierNS(fallbackDefault) ? fallbackDefault : undefined);
      prettierMod = chosen;
    } catch (_e) {
      prettierMod = undefined;
    }
  }

  return { mod: prettierMod, local: prettierLocal };
}

/**
 * Loads ESLint module with local-first strategy
 * @param baseDirs - Directories to search for local module
 * @returns ESLint constructor and local info
 */
export async function loadESLint(baseDirs: string[]): Promise<{
  ctor?: typeof import('eslint').ESLint;
  local: { modulePath: string; version: string } | null;
}> {
  let eslintLocal: { modulePath: string; version: string } | null = null;
  let eslintCtor: typeof import('eslint').ESLint | undefined;

  try {
    eslintLocal = await resolveLocalModule('eslint', baseDirs);
    if (eslintLocal && satisfies(eslintLocal.version, COMPAT.eslint)) {
      try {
        const mod = await import(eslintLocal.modulePath);
        eslintCtor = extractESLintCtor(mod);
      } catch (_e) {
        eslintCtor = undefined;
      }
    }
  } catch (_e) {
    const _ignored = _e as unknown;
    void _ignored;
  }

  if (!eslintCtor) {
    try {
      const mod = await import('eslint');
      eslintCtor = extractESLintCtor(mod);
    } catch (_e) {
      eslintCtor = undefined;
    }
  }

  return { ctor: eslintCtor, local: eslintLocal };
}

/**
 * Loads TypeScript module with local-first strategy
 * @param tsConfigPath - Path to tsconfig.json for local resolution
 * @param existingTsNs - Existing TypeScript namespace to reuse
 * @returns TypeScript namespace
 */
export async function loadTypeScript(
  tsConfigPath: string,
  existingTsNs?: typeof import('typescript'),
): Promise<typeof import('typescript')> {
  if (existingTsNs) {
    return existingTsNs;
  }

  const tsDir = tsConfigPath.substring(0, tsConfigPath.lastIndexOf('/'));
  const localTs = await resolveLocalModule('typescript', [tsDir]);

  if (localTs && satisfies(localTs.version, COMPAT.typescript)) {
    try {
      return (await import(
        localTs.modulePath
      )) as unknown as typeof import('typescript');
    } catch (e) {
      const _e = e as Error;
      console.debug(
        'Could not import local TypeScript from ' +
          localTs.modulePath +
          ': ' +
          (_e && _e.message ? _e.message : _e),
      );
    }
  }

  return (await import('typescript')) as unknown as typeof import('typescript');
}
