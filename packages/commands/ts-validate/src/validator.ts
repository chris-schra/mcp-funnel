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
  glob?: string; // Glob pattern
  fix?: boolean; // Auto-fix where possible
  cache?: boolean; // Use caching for speed
  tsConfigFile?: string; // Optional explicit tsconfig path
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
  private ctx!: ValidatorContext;

  public async validate(
    options: ValidateOptions = {},
  ): Promise<ValidationSummary> {
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
    const tsFiles = files.filter(
      (f) => f.endsWith('.ts') || f.endsWith('.tsx'),
    );
    const overrideTsConfig = options.tsConfigFile
      ? path.resolve(process.cwd(), options.tsConfigFile)
      : undefined;
    const overrideExists = overrideTsConfig
      ? fssync.existsSync(overrideTsConfig)
      : false;
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
          const pr = await validatePrettier(
            files,
            this.prettierMod!,
            this.ctx,
            options.fix,
          );
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
            /no eslint configuration|couldn['']t find a configuration/i.test(
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
              await validateTypeScriptWithConfig(
                files,
                overrideTsConfig!,
                this.ctx,
                this.tsNs,
              );
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

  // Helper method for AI to get actionable items
  public getActionableItems(): Array<{
    file: string;
    line?: number;
    fix: string;
  }> {
    return getActionableItems(this.fileResults);
  }
}
