import * as fssync from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { minimatch } from 'minimatch';
import type { ValidatorContext } from '../util/validator-context.js';
import { getTypeScriptFix } from '../util/typescript-helpers.js';
import { loadTypeScript } from '../util/tool-loader.js';

/**
 * Finds the nearest tsconfig.json file by walking up the directory tree.
 *
 * Walks up from the file's directory to the filesystem root, returning the
 * first tsconfig.json found.
 *
 * @param filePath - File path to start searching from
 * @returns Path to tsconfig.json or null if not found
 *
 * @public
 */
export function findNearestTsConfig(filePath: string): string | null {
  let currentDir = path.dirname(filePath);
  const rootDir = path.parse(currentDir).root;

  while (currentDir !== rootDir) {
    const configPath = path.join(currentDir, 'tsconfig.json');
    if (fssync.existsSync(configPath)) {
      return configPath;
    }
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break; // Reached root
    currentDir = parentDir;
  }

  return null;
}

/**
 * Filters TypeScript files based on root tsconfig exclude patterns.
 *
 * Reads the root tsconfig.json and filters out files matching its exclude
 * patterns using minimatch for glob pattern matching.
 *
 * @param tsFiles - TypeScript files to filter (absolute paths)
 * @returns Filtered list of TypeScript files not excluded by root config
 *
 * @public
 */
export function filterTsFilesByRootConfig(tsFiles: string[]): string[] {
  const rootTsConfigPath = path.resolve(process.cwd(), 'tsconfig.json');
  if (!fssync.existsSync(rootTsConfigPath)) {
    return tsFiles;
  }

  try {
    const rootConfig = JSON.parse(
      fssync.readFileSync(rootTsConfigPath, 'utf-8'),
    );
    const rootExcludePatterns: string[] = rootConfig.exclude || [];

    // Pre-compile minimatch matchers outside the filter loop for performance
    const matchers = rootExcludePatterns.map((pattern) => {
      // Use minimatch for proper glob pattern matching
      return (filePath: string) => {
        const relativePath = path.relative(process.cwd(), filePath);
        // Normalize path separators for consistent matching across platforms
        const normalizedPath = relativePath.split(path.sep).join('/');
        return minimatch(normalizedPath, pattern, {
          matchBase: true,
          dot: true,
        });
      };
    });

    // Filter out files matching root exclude patterns
    return tsFiles.filter((file) => {
      return !matchers.some((matcher) => matcher(file));
    });
  } catch {
    // Ignore errors reading root config
    return tsFiles;
  }
}

/**
 * Groups files by their nearest tsconfig.json.
 *
 * @param tsFiles - TypeScript files to group (absolute paths)
 * @returns Map of tsconfig path to files using that config
 *
 * @internal
 */
function groupFilesByNearestConfig(tsFiles: string[]): Map<string, string[]> {
  const filesByConfig = new Map<string, string[]>();
  for (const file of tsFiles) {
    const configPath = findNearestTsConfig(file);
    if (!configPath) continue;
    const list = filesByConfig.get(configPath) ?? [];
    list.push(file);
    filesByConfig.set(configPath, list);
  }
  return filesByConfig;
}

/**
 * Processes TypeScript diagnostics and adds them to the validator context.
 *
 * @param diagnostics - All diagnostics from TypeScript
 * @param filesToValidate - Set of files we want to validate
 * @param ts - TypeScript namespace
 * @param ctx - Validator context for storing results
 *
 * @internal
 */
function processDiagnostics(
  diagnostics: readonly import('typescript').Diagnostic[],
  filesToValidate: Set<string>,
  ts: typeof import('typescript'),
  ctx: ValidatorContext,
): void {
  for (const diagnostic of diagnostics) {
    if (!diagnostic.file) continue;
    const file = diagnostic.file.fileName;
    if (!filesToValidate.has(file)) continue;
    const start = diagnostic.start || 0;
    const { line, character } = ts.getLineAndCharacterOfPosition(
      diagnostic.file,
      start,
    );
    const message = ts.flattenDiagnosticMessageText(
      diagnostic.messageText,
      '\n',
    );
    const suggestedFix = getTypeScriptFix(diagnostic);
    const isError = diagnostic.category === ts.DiagnosticCategory.Error;
    ctx.addResult(file, {
      tool: 'typescript',
      message,
      severity: isError ? 'error' : 'warning',
      line: line + 1,
      column: character + 1,
      ruleId: `TS${diagnostic.code}`,
      fixable: Boolean(suggestedFix),
      suggestedFix,
    });
  }
}

/**
 * Validates TypeScript files using a specific tsconfig.
 *
 * Creates a TypeScript program with the specified config and collects
 * diagnostics for the requested files. Filters diagnostics to only include
 * files in the validation set.
 *
 * @param files - All files being validated (absolute paths)
 * @param tsConfigFile - Explicit tsconfig path to use (absolute path)
 * @param ctx - Validator context for storing results
 * @param tsNs - Existing TypeScript namespace (will be loaded if not provided)
 * @returns Promise that resolves when validation is complete
 *
 * @public
 */
export async function validateTypeScriptWithConfig(
  files: string[],
  tsConfigFile: string,
  ctx: ValidatorContext,
  tsNs?: typeof import('typescript'),
): Promise<void> {
  const tsFiles = filterTsFilesByRootConfig(
    files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx')),
  );

  if (tsFiles.length === 0) {
    return;
  }

  const ts = await loadTypeScript(tsConfigFile, tsNs);
  const { config } = ts.readConfigFile(tsConfigFile, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    path.dirname(tsConfigFile),
  );

  if (parsed.errors.length === 0) {
    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: { ...parsed.options, noEmit: true },
    });
    const filesToValidate = new Set(tsFiles);
    const allDiagnostics = [
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getSemanticDiagnostics(),
      ...program.getSyntacticDiagnostics(),
    ];
    processDiagnostics(allDiagnostics, filesToValidate, ts, ctx);
  }
}

/**
 * Parses tsconfig and logs errors if any occur.
 *
 * @param configPath - Path to tsconfig.json
 * @param ts - TypeScript namespace
 * @returns Parsed config or null if errors occurred
 *
 * @internal
 */
function parseConfigWithErrorLogging(
  configPath: string,
  ts: typeof import('typescript'),
): import('typescript').ParsedCommandLine | null {
  const { config } = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config,
    ts.sys,
    path.dirname(configPath),
  );

  if (parsed.errors.length > 0) {
    console.error(chalk.red(`Error parsing ${configPath}:`));
    parsed.errors.forEach((error) => {
      const message = ts.flattenDiagnosticMessageText(error.messageText, '\n');
      console.error(`  ${message}`);
    });
    return null;
  }

  return parsed;
}

/**
 * Validates TypeScript files by discovering tsconfig.json for each file.
 *
 * Groups files by their nearest tsconfig.json (walking up directory tree),
 * then validates each group using its corresponding TypeScript configuration.
 * This handles monorepos with multiple tsconfig files correctly.
 *
 * @param files - All files being validated (absolute paths)
 * @param ctx - Validator context for storing results
 * @param tsNs - Existing TypeScript namespace (will be loaded if not provided)
 * @returns Promise that resolves when validation is complete
 *
 * @public
 */
export async function validateTypeScriptByDiscovery(
  files: string[],
  ctx: ValidatorContext,
  tsNs?: typeof import('typescript'),
): Promise<void> {
  const tsFiles = filterTsFilesByRootConfig(
    files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx')),
  );

  if (tsFiles.length === 0) {
    return;
  }

  const filesByConfig = groupFilesByNearestConfig(tsFiles);

  let ts = tsNs;
  for (const [configPath, configFiles] of filesByConfig.entries()) {
    ts = await loadTypeScript(configPath, ts);
    if (!ts) throw new Error('Could not load TypeScript');

    const parsed = parseConfigWithErrorLogging(configPath, ts);
    if (!parsed) continue;

    const program = ts.createProgram({
      rootNames: parsed.fileNames,
      options: { ...parsed.options, noEmit: true },
    });

    const parsedFileSet = new Set(parsed.fileNames.map((f) => path.resolve(f)));
    const filesToValidate = new Set(
      configFiles.filter((file) => parsedFileSet.has(path.resolve(file))),
    );

    const allDiagnostics = [
      ...program.getOptionsDiagnostics(),
      ...program.getGlobalDiagnostics(),
      ...program.getSemanticDiagnostics(),
      ...program.getSyntacticDiagnostics(),
    ];

    processDiagnostics(allDiagnostics, filesToValidate, ts, ctx);
  }
}
