import * as fs from 'fs/promises';
import * as path from 'path';
import { createRequire } from 'module';

const requireFromHere = createRequire(import.meta.url);

/**
 * Resolves a local module (prettier, eslint, or typescript) from given directories.
 *
 * Searches for the specified module in the provided directories using Node's
 * require resolution algorithm. Returns the module path and version if found.
 *
 * @param name - Module name to resolve
 * @param fromDirs - Directories to search from (in order of precedence)
 * @returns Promise resolving to module path and version, or null if not found
 *
 * @example
 * ```typescript
 * const result = await resolveLocalModule('prettier', [process.cwd()]);
 * if (result) {
 *   console.log(`Found prettier ${result.version} at ${result.modulePath}`);
 * }
 * ```
 *
 * @public
 */
export async function resolveLocalModule(
  name: 'prettier' | 'eslint' | 'typescript',
  fromDirs: string[],
): Promise<{ modulePath: string; version: string } | null> {
  const tried = new Set<string>();
  for (const base of fromDirs) {
    const dir = path.resolve(base);
    if (tried.has(dir)) continue;
    tried.add(dir);
    try {
      const pkgJsonPath = requireFromHere.resolve(`${name}/package.json`, {
        paths: [dir],
      });
      const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, 'utf-8')) as {
        version: string;
        main?: string;
        module?: string;
      };
      const entry = (() => {
        if (pkgJson.module)
          return path.join(path.dirname(pkgJsonPath), pkgJson.module);
        if (pkgJson.main)
          return path.join(path.dirname(pkgJsonPath), pkgJson.main);
        return requireFromHere.resolve(name, { paths: [dir] });
      })();
      return { modulePath: entry, version: pkgJson.version };
    } catch (_e) {
      continue;
    }
  }
  return null;
}

/**
 * Extracts ESLint constructor from a dynamically loaded module.
 *
 * Handles various export formats (direct export, default export, nested exports)
 * to extract the ESLint class constructor from a dynamically imported module.
 *
 * @param mod - Dynamically imported ESLint module
 * @returns ESLint constructor if found, undefined otherwise
 *
 * @public
 */
export function extractESLintCtor(
  mod: unknown,
): (typeof import('eslint'))['ESLint'] | undefined {
  if (!mod || (typeof mod !== 'object' && typeof mod !== 'function'))
    return undefined;
  const obj = mod as Record<string, unknown>;
  const direct = obj.ESLint as unknown;
  if (typeof direct === 'function')
    return direct as (typeof import('eslint'))['ESLint'];
  const def = obj.default as unknown;
  if (def && typeof def === 'object') {
    const nested = (def as Record<string, unknown>).ESLint as unknown;
    if (typeof nested === 'function')
      return nested as (typeof import('eslint'))['ESLint'];
  }
  if (def && typeof def === 'function') {
    return def as (typeof import('eslint'))['ESLint'];
  }
  return undefined;
}

/**
 * Type guard to check if a module is a valid Prettier namespace.
 *
 * Verifies that the module has the required Prettier methods (format,
 * getFileInfo, resolveConfig) to be considered a valid Prettier instance.
 *
 * @param x - Potential Prettier module to validate
 * @returns True if x is a valid Prettier namespace, false otherwise
 *
 * @public
 */
export function isPrettierNS(x: unknown): x is typeof import('prettier') {
  if (!x || (typeof x !== 'object' && typeof x !== 'function')) return false;
  const obj = x as Record<string, unknown>;
  return (
    typeof obj['format'] === 'function' &&
    typeof obj['getFileInfo'] === 'function' &&
    typeof obj['resolveConfig'] === 'function'
  );
}
