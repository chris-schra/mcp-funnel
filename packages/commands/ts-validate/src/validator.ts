#!/usr/bin/env tsx
import { globby } from 'globby';
import * as fs from 'fs/promises';
import * as fssync from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { createRequire } from 'module';
import { satisfies } from 'semver';

const requireFromHere = createRequire(import.meta.url);

const COMPAT = {
  prettier: '>=3.0.0 <4.0.0',
  eslint: '>=9.0.0 <10.0.0',
  typescript: '>=5.0.0 <6.0.0',
} as const;

async function resolveLocalModule(
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

function extractESLintCtor(
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

function isPrettierNS(x: unknown): x is typeof import('prettier') {
  if (!x || (typeof x !== 'object' && typeof x !== 'function')) return false;
  const obj = x as Record<string, unknown>;
  return (
    typeof obj['format'] === 'function' &&
    typeof obj['getFileInfo'] === 'function' &&
    typeof obj['resolveConfig'] === 'function'
  );
}

// Base validation result for each tool's finding
export interface ValidationResult {
  tool: 'prettier' | 'eslint' | 'typescript';
  message: string;
  severity: 'error' | 'warning' | 'info';
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;

  // Key addition: fixability information
  fixable?: boolean;
  fixedAutomatically?: boolean;
  suggestedFix?: string; // For TypeScript: might include suggested code
  ruleId?: string; // ESLint rule or TS error code
}

// File-centric results
export type FileValidationResults = Record<string, ValidationResult[]>;

export interface ValidateOptions {
  files?: string[]; // Specific files
  glob?: string; // Glob patter
  fix?: boolean; // Auto-fix where possible
  cache?: boolean; // Use caching for speed
}

export interface ValidationSummary {
  // File-centric view for AI processing
  fileResults: FileValidationResults;
  // All files processed (used for optional expansion when compact=false)
  processedFiles?: string[];

  // Summary stats
  totalFiles: number;
  filesWithErrors: number;
  fixableFiles: string[]; // Files that can be auto-fixed
  unfixableFiles: string[]; // Files needing manual intervention

  // Suggested actions for AI
  suggestedActions: Array<{
    file: string;
    action: 'prettier-fix' | 'eslint-fix' | 'manual-fix';
    description: string;
  }>;

  // Per-tool execution status to preserve summary on partial failures
  toolStatuses: ToolRunStatus[];
}

export type ToolStatus = 'ok' | 'skipped' | 'failed';

export interface ToolRunStatus {
  tool: 'prettier' | 'eslint' | 'typescript';
  status: ToolStatus;
  reason?: string; // e.g., 'no-eslint-config', 'no-tsconfig', 'no-ts-files'
  error?: string; // error message if failed
  origin?: 'local' | 'bundled';
  version?: string;
}

export class MonorepoValidator {
  private fileResults: FileValidationResults = {};
  private prettierMod?: typeof import('prettier');
  private eslintCtor?: typeof import('eslint').ESLint;
  private tsNs?: typeof import('typescript');

  async validate(options: ValidateOptions = {}): Promise<ValidationSummary> {
    // Resolve files to validate
    const files = await this.resolveFiles(options);

    if (files.length === 0) {
      console.warn(chalk.yellow('No files found matching the pattern'));
      return this.createSummary([], 0);
    }

    const toolStatuses: ToolRunStatus[] = [];

    // Resolve toolchains (prettier/eslint) with local-first strategy
    const cwd = process.cwd();
    const baseDirs = [cwd];

    let prettierLocal: { modulePath: string; version: string } | null = null;
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
          this.prettierMod = chosen;
        } catch (_e) {
          this.prettierMod = undefined;
        }
      }
    } catch (_e) {
      const _ignored = _e as unknown;
      void _ignored;
    }
    if (!this.prettierMod) {
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
          direct ||
          (isPrettierNS(fallbackDefault) ? fallbackDefault : undefined);
        this.prettierMod = chosen;
      } catch (_e) {
        this.prettierMod = undefined;
      }
    }

    let eslintLocal: { modulePath: string; version: string } | null = null;
    try {
      eslintLocal = await resolveLocalModule('eslint', baseDirs);
      if (eslintLocal && satisfies(eslintLocal.version, COMPAT.eslint)) {
        try {
          const mod = await import(eslintLocal.modulePath);
          this.eslintCtor = extractESLintCtor(mod);
        } catch (_e) {
          this.eslintCtor = undefined;
        }
      }
    } catch (_e) {
      const _ignored = _e as unknown;
      void _ignored;
    }
    if (!this.eslintCtor) {
      try {
        const mod = await import('eslint');
        this.eslintCtor = extractESLintCtor(mod);
      } catch (_e) {
        this.eslintCtor = undefined;
      }
    }

    // Prepare TS config detection for skip decision
    const tsFiles = files.filter(
      (f) => f.endsWith('.ts') || f.endsWith('.tsx'),
    );
    const tsConfigPaths = new Set<string>();
    if (tsFiles.length > 0) {
      for (const f of tsFiles) {
        const cfg = this.findNearestTsConfig(f);
        if (cfg) tsConfigPaths.add(cfg);
      }
    }

    // Run validators concurrently but isolate failures
    const tasks: Promise<void>[] = [];

    // Prettier runner
    tasks.push(
      (async () => {
        try {
          const pr = await this.validatePrettier(files, options.fix);
          const origin: 'local' | 'bundled' =
            prettierLocal && satisfies(prettierLocal.version, COMPAT.prettier)
              ? 'local'
              : 'bundled';
          toolStatuses.push({
            tool: 'prettier',
            status: 'ok',
            origin,
            version: origin === 'local' ? prettierLocal?.version : undefined,
            configFound: pr.configFound,
            reason: pr.configFound ? undefined : 'prettier-defaults',
          });
        } catch (e) {
          toolStatuses.push({
            tool: 'prettier',
            status: 'failed',
            error: e instanceof Error ? e.message : String(e),
          });
        }
      })(),
    );

    // ESLint runner
    tasks.push(
      (async () => {
        try {
          await this.validateESLint(files, options.fix);
          const origin: 'local' | 'bundled' =
            eslintLocal && satisfies(eslintLocal.version, COMPAT.eslint)
              ? 'local'
              : 'bundled';
          toolStatuses.push({
            tool: 'eslint',
            status: 'ok',
            origin,
            version: origin === 'local' ? eslintLocal?.version : undefined,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const isNoConfig =
            /no eslint configuration|couldn['’]t find a configuration/i.test(
              msg,
            );
          toolStatuses.push(
            isNoConfig
              ? {
                  tool: 'eslint',
                  status: 'skipped',
                  reason: 'no-eslint-config',
                }
              : { tool: 'eslint', status: 'failed', error: msg },
          );
        }
      })(),
    );

    // TypeScript runner (skip if no tsconfig or no ts files)
    if (tsFiles.length === 0) {
      toolStatuses.push({
        tool: 'typescript',
        status: 'skipped',
        reason: 'no-ts-files',
      });
    } else if (tsConfigPaths.size === 0) {
      toolStatuses.push({
        tool: 'typescript',
        status: 'skipped',
        reason: 'no-tsconfig',
      });
    } else {
      tasks.push(
        (async () => {
          try {
            await this.validateTypeScript(files);
            toolStatuses.push({ tool: 'typescript', status: 'ok' });
          } catch (e) {
            toolStatuses.push({
              tool: 'typescript',
              status: 'failed',
              error: e instanceof Error ? e.message : String(e),
            });
          }
        })(),
      );
    }

    await Promise.allSettled(tasks);

    const summary = this.createSummary(toolStatuses, files.length);
    // Attach processed files for optional expansion in the caller (not part of public API)
    summary.processedFiles = files;
    return summary;
  }

  private async resolveFiles(options: ValidateOptions): Promise<string[]> {
    if (options.files) {
      // Process each provided path
      const patterns: string[] = [];

      for (const file of options.files) {
        const absolutePath = path.isAbsolute(file)
          ? file
          : path.resolve(process.cwd(), file);

        try {
          const stats = await fs.stat(absolutePath);

          if (stats.isDirectory()) {
            // Convert directory to glob pattern
            patterns.push(path.join(absolutePath, '**/*.{ts,tsx,js,jsx,json}'));
          } else {
            // Keep files as-is
            patterns.push(absolutePath);
          }
        } catch {
          // If stat fails, treat as a glob pattern or non-existent file
          // Let it be handled by globby or fail later in validation
          patterns.push(absolutePath);
        }
      }

      // Use globby to expand all patterns
      // Only ignore node_modules for performance - let each tool handle its own ignores
      return globby(patterns, {
        ignore: ['**/node_modules/**'],
        absolute: true,
      });
    }

    const pattern = options.glob || 'packages/**/*.{ts,tsx,js,jsx,json}';
    // Only ignore node_modules for performance - let each tool handle its own ignores
    return globby(pattern, {
      ignore: ['**/node_modules/**'],
      absolute: true,
    });
  }

  private async validatePrettier(
    files: string[],
    autoFix?: boolean,
  ): Promise<{ configFound: boolean }> {
    const prettier = this.prettierMod!;
    let configFound = false;
    for (const file of files) {
      // Use prettier's built-in getFileInfo to check if file should be ignored
      const fileInfo = await prettier.getFileInfo(file, {
        ignorePath: '.prettierignore',
      });

      // Skip if prettier says to ignore this file
      if (fileInfo.ignored) {
        continue;
      }

      try {
        const source = await fs.readFile(file, 'utf-8');
        const resolved = await prettier.resolveConfig(file);
        if (resolved) configFound = true;
        const options = resolved || {};

        const formatted = await prettier.format(source, {
          ...options,
          filepath: file,
        });

        const needsFormatting = source !== formatted;

        if (needsFormatting) {
          const result: ValidationResult = {
            tool: 'prettier',
            message: 'File needs formatting',
            severity: 'error',
            fixable: true,
            fixedAutomatically: false,
          };

          if (autoFix) {
            await fs.writeFile(file, formatted);
            result.fixedAutomatically = true;
            result.message = 'File was automatically formatted';
            result.severity = 'info';
          }

          // Ensure the file entry exists before pushing
          if (!this.fileResults[file]) {
            this.fileResults[file] = [];
          }
          this.fileResults[file]?.push(result);
        }
      } catch (error) {
        // Ensure the file entry exists before pushing
        if (!this.fileResults[file]) {
          this.fileResults[file] = [];
        }
        this.fileResults[file]?.push({
          tool: 'prettier',
          message: `Prettier error: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error',
          fixable: false,
        });
      }
    }
    return { configFound };
  }

  private async validateESLint(files: string[], autoFix?: boolean) {
    const ESLintCtor = this.eslintCtor!;
    const eslint = new ESLintCtor({
      cache: true,
      fix: autoFix, // Enable auto-fixing if requested
    });

    // Filter out files that ESLint should ignore
    const lintableFiles = await Promise.all(
      files.map(async (file) => {
        const isIgnored = await eslint.isPathIgnored(file);
        return isIgnored ? null : file;
      }),
    );

    const filesToLint = lintableFiles.filter(Boolean) as string[];

    if (filesToLint.length === 0) {
      return;
    }

    const results = await eslint.lintFiles(filesToLint);

    for (const result of results) {
      const file = result.filePath;

      // If auto-fix was applied, write the output
      if (autoFix && result.output) {
        await fs.writeFile(file, result.output);
      }

      for (const message of result.messages) {
        const ruleId = message.ruleId as string;
        if (ruleId === '@typescript-eslint/no-unused-vars') {
          message.message +=
            ' Analyze if the variable will be used in future iterations of the current task - if so, add a TODO comment and use _ prefix. If not, remove the variable.';
        } else if (ruleId === '@typescript-eslint/no-explicit-any') {
          message.message +=
            ' Do not use: any, double casts like `as unknown as OtherType`. Make sure to lookup the correct type. If necessary, you can usually use Partial<>.';
        }

        const validationResult: ValidationResult = {
          tool: 'eslint',
          message: message.message,
          severity: message.severity === 2 ? 'error' : 'warning',
          line: message.line,
          column: message.column,
          endLine: message.endLine ?? undefined,
          endColumn: message.endColumn ?? undefined,
          ruleId: message.ruleId ?? undefined,
          fixable: Boolean(message.fix),
          fixedAutomatically: autoFix && Boolean(message.fix),
        };

        // Only add if not fixed or if it's unfixable
        if (!validationResult.fixedAutomatically || !validationResult.fixable) {
          this.fileResults[file]?.push(validationResult);
        }
      }

      // Add info about successful fixes
      if (autoFix && result.output) {
        const fixCount = result.fixableErrorCount + result.fixableWarningCount;
        if (fixCount > 0) {
          this.fileResults[file]?.push({
            tool: 'eslint',
            message: `Fixed ${fixCount} issue(s)`,
            severity: 'info',
            fixedAutomatically: true,
          });
        }
      }
    }
  }

  private findNearestTsConfig(filePath: string): string | null {
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

  private async validateTypeScript(files: string[]) {
    // Filter to only TypeScript files
    const tsFiles = files.filter(
      (f) => f.endsWith('.ts') || f.endsWith('.tsx'),
    );

    if (tsFiles.length === 0) {
      return;
    }

    // Group files by their nearest tsconfig.json
    const filesByConfig = new Map<string, string[]>();

    for (const file of tsFiles) {
      const configPath = this.findNearestTsConfig(file);
      if (!configPath) {
        // No tsconfig found for this file; skip to avoid misconfiguration
        continue;
      }
      const list = filesByConfig.get(configPath) ?? [];
      list.push(file);
      filesByConfig.set(configPath, list);
    }
    // Validate each group using the TypeScript programmatic API so tsconfig paths/baseUrl apply
    for (const [configPath, configFiles] of filesByConfig.entries()) {
      // Load TS namespace resolved from the tsconfig directory if compatible
      if (!this.tsNs) {
        const tsDir = path.dirname(configPath);
        const localTs = await resolveLocalModule('typescript', [tsDir]);
        if (localTs && satisfies(localTs.version, '>=5.0.0 <6.0.0')) {
          try {
            this.tsNs = (await import(
              localTs.modulePath
            )) as unknown as typeof import('typescript');
          } catch (_e) {
            const _ignored = _e as unknown;
            void _ignored; // fall through to bundled
          }
        }
        if (!this.tsNs) {
          this.tsNs = (await import(
            'typescript'
          )) as unknown as typeof import('typescript');
        }
      }
      const tsNs = this.tsNs!;

      const { config } = tsNs.readConfigFile(configPath, tsNs.sys.readFile);

      // Parse the config for this project
      const parsed = tsNs.parseJsonConfigFileContent(
        config,
        tsNs.sys,
        path.dirname(configPath),
      );

      if (parsed.errors.length > 0) {
        console.error(chalk.red(`Error parsing ${configPath}:`));
        parsed.errors.forEach((error) => {
          const message = tsNs.flattenDiagnosticMessageText(
            error.messageText,
            '\n',
          );
          console.error(`  ${message}`);
        });
        continue;
      }

      // Create a program for the entire project, but collect diagnostics only for files we care about
      const program = tsNs.createProgram({
        rootNames: parsed.fileNames,
        options: { ...parsed.options, noEmit: true },
      });

      const filesToValidate = new Set(configFiles);
      const sourceFiles = program
        .getSourceFiles()
        .filter(
          (sf) => !sf.isDeclarationFile && filesToValidate.has(sf.fileName),
        );

      for (const sourceFile of sourceFiles) {
        const diagnostics = [
          ...program.getSemanticDiagnostics(sourceFile),
          ...program.getSyntacticDiagnostics(sourceFile),
        ];

        for (const diagnostic of diagnostics) {
          if (!diagnostic.file) continue;

          const file = diagnostic.file.fileName;
          const start = diagnostic.start || 0;
          const { line, character } = tsNs.getLineAndCharacterOfPosition(
            diagnostic.file,
            start,
          );

          const message = tsNs.flattenDiagnosticMessageText(
            diagnostic.messageText,
            '\n',
          );

          const suggestedFix = this.getTypeScriptFix(diagnostic);

          const isError = diagnostic.category === tsNs.DiagnosticCategory.Error;

          this.fileResults[file]?.push({
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
    }
  }

  private getTypeScriptFix(
    diagnostic: import('typescript').Diagnostic,
  ): string | undefined {
    // This could be expanded to detect common fixable patterns
    // For now, just identify some common cases
    const code = diagnostic.code;

    // Common auto-fixable TypeScript errors
    const fixableErrors: Record<number, string> = {
      2304: 'Add missing import',
      2339: 'Add property to type/interface',
      2345: 'Fix type mismatch',
      2551: 'Fix typo in property name',
      7006: 'Add type annotation',
      2741: 'Add missing properties',
      2322: 'Fix type assignment',
      2769: 'Fix overload signature',
    };

    return fixableErrors[code];
  }

  private createSummary(
    toolStatuses: ToolRunStatus[],
    totalFilesCount: number,
  ): ValidationSummary {
    const filesWithErrors = Object.keys(this.fileResults).filter(
      (file) => this.fileResults[file].length > 0,
    );

    const fixableFiles = Object.keys(this.fileResults).filter((file) =>
      this.fileResults[file].some((r) => r.fixable && !r.fixedAutomatically),
    );

    const unfixableFiles = Object.keys(this.fileResults).filter((file) =>
      this.fileResults[file].some((r) => !r.fixable && r.severity === 'error'),
    );

    // Generate suggested actions for AI
    const suggestedActions = this.generateSuggestedActions();

    return {
      fileResults: this.fileResults,
      processedFiles: undefined, // set by caller if needed
      totalFiles: totalFilesCount,
      filesWithErrors: filesWithErrors.length,
      fixableFiles,
      unfixableFiles,
      suggestedActions,
      toolStatuses,
    };
  }

  private generateSuggestedActions(): ValidationSummary['suggestedActions'] {
    const actions: ValidationSummary['suggestedActions'] = [];

    for (const [file, results] of Object.entries(this.fileResults)) {
      const hasUnfixedPrettier = results.some(
        (r) => r.tool === 'prettier' && r.fixable && !r.fixedAutomatically,
      );
      const hasUnfixedEslint = results.some(
        (r) => r.tool === 'eslint' && r.fixable && !r.fixedAutomatically,
      );
      const hasTypeErrors = results.some(
        (r) => r.tool === 'typescript' && r.severity === 'error',
      );

      if (hasUnfixedPrettier) {
        actions?.push({
          file,
          action: 'prettier-fix',
          description: 'Run prettier --write on this file',
        });
      }

      if (hasUnfixedEslint) {
        actions?.push({
          file,
          action: 'eslint-fix',
          description: 'Run eslint --fix on this file',
        });
      }

      if (hasTypeErrors) {
        actions?.push({
          file,
          action: 'manual-fix',
          description: 'Manual TypeScript fixes required',
        });
      }
    }

    return actions;
  }

  // Helper method for AI to get actionable items
  getActionableItems(): Array<{ file: string; line?: number; fix: string }> {
    const items = [];

    for (const [file, results] of Object.entries(this.fileResults)) {
      for (const result of results) {
        if (result.severity === 'error' && !result.fixedAutomatically) {
          items?.push({
            file,
            line: result.line,
            fix: result.suggestedFix || result.message,
          });
        }
      }
    }

    return items;
  }
}
