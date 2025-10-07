import { satisfies } from 'semver';
import { resolveLocalModule, extractESLintCtor, isPrettierNS } from './module-resolver.js';

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
 * Extracts Prettier namespace from an imported module.
 * Handles both direct exports and default exports.
 *
 * @param mod - The imported module to extract Prettier from
 * @returns Prettier namespace if found, undefined otherwise
 */
function extractPrettierNamespace(mod: unknown): typeof import('prettier') | undefined {
  const direct = isPrettierNS(mod) ? mod : undefined;
  if (direct) return direct;

  const defaultExport =
    mod && typeof (mod as { default?: unknown }).default !== 'undefined'
      ? (mod as { default?: unknown }).default
      : undefined;

  return isPrettierNS(defaultExport) ? defaultExport : undefined;
}

/**
 * Attempts to import and extract Prettier from a module path.
 *
 * @param modulePath - Path to the Prettier module to import
 * @returns Promise resolving to Prettier namespace if found, undefined otherwise
 */
async function tryImportPrettier(
  modulePath: string,
): Promise<typeof import('prettier') | undefined> {
  try {
    const mod: unknown = await import(modulePath);
    return extractPrettierNamespace(mod);
  } catch (_e) {
    return undefined;
  }
}

/**
 * Attempts to load local Prettier if version is compatible.
 *
 * @param localInfo - Local module information with path and version
 * @returns Promise resolving to Prettier namespace if compatible, undefined otherwise
 */
async function tryLoadLocalPrettier(
  localInfo: { modulePath: string; version: string } | null,
): Promise<typeof import('prettier') | undefined> {
  if (!localInfo || !satisfies(localInfo.version, COMPAT.prettier)) {
    return undefined;
  }
  return tryImportPrettier(localInfo.modulePath);
}

/**
 * Loads Prettier module with local-first strategy.
 *
 * Attempts to load Prettier from the project's local node_modules first,
 * falling back to the bundled version if local resolution fails or version
 * is incompatible.
 *
 * @param baseDirs - Directories to search for local module (in order)
 * @returns Promise resolving to Prettier module instance and local info
 *
 * @example
 * ```typescript
 * const { mod, local } = await loadPrettier([process.cwd()]);
 * if (local) {
 *   console.log(`Using local Prettier ${local.version}`);
 * }
 * ```
 *
 * @public
 */
export async function loadPrettier(baseDirs: string[]): Promise<{
  mod?: typeof import('prettier');
  local: { modulePath: string; version: string } | null;
}> {
  let prettierLocal: { modulePath: string; version: string } | null = null;
  let prettierMod: typeof import('prettier') | undefined;

  try {
    prettierLocal = await resolveLocalModule('prettier', baseDirs);
    prettierMod = await tryLoadLocalPrettier(prettierLocal);
  } catch (_e) {
    const _ignored = _e as unknown;
    void _ignored;
  }

  if (!prettierMod) {
    prettierMod = await tryImportPrettier('prettier');
  }

  return { mod: prettierMod, local: prettierLocal };
}

/**
 * Loads ESLint module with local-first strategy.
 *
 * Attempts to load ESLint from the project's local node_modules first,
 * falling back to the bundled version if local resolution fails or version
 * is incompatible.
 *
 * @param baseDirs - Directories to search for local module (in order)
 * @returns Promise resolving to ESLint constructor and local info
 *
 * @example
 * ```typescript
 * const { ctor, local } = await loadESLint([process.cwd()]);
 * if (ctor) {
 *   const eslint = new ctor({ cache: true });
 * }
 * ```
 *
 * @public
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
 * Loads TypeScript module with local-first strategy.
 *
 * Attempts to load TypeScript from the project's local node_modules (using
 * tsconfig directory as resolution base), falling back to the bundled version.
 * Reuses existing namespace if provided.
 *
 * @param tsConfigPath - Path to tsconfig.json for local resolution
 * @param existingTsNs - Existing TypeScript namespace to reuse (optional)
 * @returns Promise resolving to TypeScript namespace
 *
 * @public
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
      return (await import(localTs.modulePath)) as unknown as typeof import('typescript');
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
