#!/usr/bin/env tsx
import * as fssync from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { satisfies } from 'semver';
import { ValidatorContext } from './util/validator-context.js';
import { loadPrettier, loadESLint } from './util/tool-loader.js';
import { validatePrettier } from './validators/prettier-validator.js';
import { validateESLint } from './validators/eslint-validator.js';
import {
  validateTypeScriptWithConfig,
  validateTypeScriptByDiscovery,
  findNearestTsConfig,
} from './validators/typescript-validator.js';
import { createSummary, getActionableItems } from './util/summary-generator.js';
import { resolveFiles } from './util/file-resolver.js';

const COMPAT = {
  prettier: '>=3.0.0 <4.0.0',
  eslint: '>=9.0.0 <10.0.0',
  typescript: '>=5.0.0 <6.0.0',
} as const;

/**
 * Base validation result for each tool's finding.
 * @public
 */
export interface ValidationResult {
  /** Tool that generated this result */
  tool: 'prettier' | 'eslint' | 'typescript';
  /** Validation message */
  message: string;
  /** Severity level */
  severity: 'error' | 'warning' | 'info';
  /** Line number (1-based) */
  line?: number;
  /** Column number (1-based) */
  column?: number;
  /** End line number (1-based) */
  endLine?: number;
  /** End column number (1-based) */
  endColumn?: number;
  /** Whether this issue can be auto-fixed */
  fixable?: boolean;
  /** Whether this issue was automatically fixed */
  fixedAutomatically?: boolean;
  /** Suggested fix for TypeScript errors */
  suggestedFix?: string;
  /** ESLint rule ID or TypeScript error code */
  ruleId?: string;
}

/**
 * File-centric validation results keyed by file path.
 * @public
 */
export type FileValidationResults = Record<string, ValidationResult[]>;

/**
 * Options for validation.
 * @public
 */
export interface ValidateOptions {
  /** Specific files or directories to validate */
  files?: string[];
  /** Glob pattern to match files */
  glob?: string;
  /** Auto-fix issues where possible */
  fix?: boolean;
  /** Use caching for improved speed */
  cache?: boolean;
  /** Optional explicit tsconfig.json path */
  tsConfigFile?: string;
}

/**
 * Validation summary with results and statistics.
 * @public
 */
export interface ValidationSummary {
  /** File-centric view for AI processing */
  fileResults: FileValidationResults;
  /** All files processed (optional expansion when compact=false) */
  processedFiles?: string[];
  /** Total number of files validated */
  totalFiles: number;
  /** Number of files with errors */
  filesWithErrors: number;
  /** Files that can be auto-fixed */
  fixableFiles: string[];
  /** Files needing manual intervention */
  unfixableFiles: string[];
  /** Suggested actions for AI agent */
  suggestedActions: Array<{
    file: string;
    action: 'prettier-fix' | 'eslint-fix' | 'manual-fix';
    description: string;
  }>;
  /** Per-tool execution status to preserve summary on partial failures */
  toolStatuses: ToolRunStatus[];
}

/**
 * Tool execution status.
 * @public
 */
export type ToolStatus = 'ok' | 'skipped' | 'failed';

/**
 * Status information for a validation tool.
 * @public
 */
export interface ToolRunStatus {
  /** Tool name */
  tool: 'prettier' | 'eslint' | 'typescript';
  /** Execution status */
  status: ToolStatus;
  /** Reason for skip/failure (e.g., 'no-eslint-config') */
  reason?: string;
  /** Error message if failed */
  error?: string;
  /** Whether using local or bundled tool */
  origin?: 'local' | 'bundled';
  /** Tool version if local */
  version?: string;
}

/**
 * Monorepo validator for TypeScript, ESLint, and Prettier.
 *
 * Validates multiple files across a monorepo using local-first tool resolution,
 * with support for auto-fixing and detailed error reporting.
 *
 * @example
 * ```typescript
 * const validator = new MonorepoValidator();
 * const summary = await validator.validate({
 *   files: ['src/index.ts'],
 *   fix: true
 * });
 * console.log(`Validated ${summary.totalFiles} files`);
 * ```
 *
 * @public
 */
export class MonorepoValidator {
  private fileResults: FileValidationResults = {};
  private prettierMod?: typeof import('prettier');
  private eslintCtor?: typeof import('eslint').ESLint;
  private tsNs?: typeof import('typescript');
  private ctx!: ValidatorContext;

  /**
   * Validates files using Prettier, ESLint, and TypeScript.
   *
   * Resolves files from options, loads appropriate tooling (local-first),
   * and runs all validators concurrently with isolated failure handling.
   *
   * @param options - Validation options
   * @returns Promise resolving to validation summary with results and stats
   */
  public async validate(options: ValidateOptions = {}): Promise<ValidationSummary> {
    // Resolve files to validate
    const files = await resolveFiles(options);

    if (files.length === 0) {
      console.warn(chalk.yellow('No files found matching the pattern'));
      return createSummary(this.fileResults, [], 0);
    }

    // Initialize context
    this.ctx = new ValidatorContext(this.fileResults);

    const toolStatuses: ToolRunStatus[] = [];

    // Resolve toolchains (prettier/eslint) with local-first strategy
    const cwd = process.cwd();
    const baseDirs = [cwd];

    const prettierResult = await loadPrettier(baseDirs);
    this.prettierMod = prettierResult.mod;
    const prettierLocal = prettierResult.local;

    const eslintResult = await loadESLint(baseDirs);
    this.eslintCtor = eslintResult.ctor;
    const eslintLocal = eslintResult.local;

    // Prepare TS config detection for skip decision
    const tsFiles = files.filter((f) => f.endsWith('.ts') || f.endsWith('.tsx'));
    const overrideTsConfig = options.tsConfigFile
      ? path.resolve(process.cwd(), options.tsConfigFile)
      : undefined;
    const overrideExists = overrideTsConfig ? fssync.existsSync(overrideTsConfig) : false;
    const tsConfigPaths = new Set<string>();
    if (!overrideExists && tsFiles.length > 0) {
      for (const f of tsFiles) {
        const cfg = findNearestTsConfig(f);
        if (cfg) tsConfigPaths.add(cfg);
      }
    }

    // Run validators concurrently but isolate failures
    const tasks: Promise<void>[] = [];

    // Prettier runner
    tasks.push(
      (async () => {
        try {
          const pr = await validatePrettier(files, this.prettierMod!, this.ctx, options.fix);
          const origin: 'local' | 'bundled' =
            prettierLocal && satisfies(prettierLocal.version, COMPAT.prettier)
              ? 'local'
              : 'bundled';
          toolStatuses.push({
            tool: 'prettier',
            status: 'ok',
            origin,
            version: origin === 'local' ? prettierLocal?.version : undefined,
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
          await validateESLint(files, this.eslintCtor!, this.ctx, options.fix);
          const origin: 'local' | 'bundled' =
            eslintLocal && satisfies(eslintLocal.version, COMPAT.eslint) ? 'local' : 'bundled';
          toolStatuses.push({
            tool: 'eslint',
            status: 'ok',
            origin,
            version: origin === 'local' ? eslintLocal?.version : undefined,
          });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          const isNoConfig = /no eslint configuration|couldn['']t find a configuration/i.test(msg);
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
    } else if (overrideTsConfig) {
      if (!overrideExists) {
        toolStatuses.push({
          tool: 'typescript',
          status: 'skipped',
          reason: 'no-tsconfig',
        });
      } else {
        tasks.push(
          (async () => {
            try {
              await validateTypeScriptWithConfig(files, overrideTsConfig!, this.ctx, this.tsNs);
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
    } else {
      if (tsConfigPaths.size === 0) {
        toolStatuses.push({
          tool: 'typescript',
          status: 'skipped',
          reason: 'no-tsconfig',
        });
      } else {
        tasks.push(
          (async () => {
            try {
              await validateTypeScriptByDiscovery(files, this.ctx, this.tsNs);
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
    }

    await Promise.allSettled(tasks);

    const summary = createSummary(this.fileResults, toolStatuses, files.length);
    // Attach processed files for optional expansion in the caller (not part of public API)
    summary.processedFiles = files;
    return summary;
  }

  /**
   * Gets actionable items for AI agent from validation results.
   *
   * Extracts unfixed errors and formats them as actionable items with
   * file locations and suggested fixes.
   *
   * @returns Array of actionable items with file, line, and fix suggestion
   */
  public getActionableItems(): Array<{
    file: string;
    line?: number;
    fix: string;
  }> {
    return getActionableItems(this.fileResults);
  }
}
