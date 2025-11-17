/**
 * Simplified TypeDoc engine wrapper for tsci command
 * Single-shot conversion only (no watch mode, no events)
 * Cherry-picked from POC's engine.ts and cli.ts
 */

import { Application, LogLevel, type ProjectReflection, type TypeDocOptions } from 'typedoc';
import * as ts from 'typescript';
import type { EngineOptions, SymbolMetadata } from '../types/index.js';
import { SymbolCollector } from './symbolCollector.js';
import { dirname } from 'path';
import { readFileSync } from 'fs';

/**
 * TypeDoc engine wrapper that provides single-shot conversion
 * and symbol collection functionality
 */
export class TypeDocEngine {
  private app: Application | null = null;
  private project: ProjectReflection | null = null;
  private symbolCollector: SymbolCollector;
  private symbols: SymbolMetadata[] = [];
  private program: ts.Program | null = null;
  private checker: ts.TypeChecker | null = null;

  public constructor(private options: EngineOptions) {
    // Get project root from tsconfig directory for relative path generation
    const projectRoot = dirname(this.options.tsconfig);
    this.symbolCollector = new SymbolCollector(projectRoot);
  }

  /**
   * Initialize the TypeDoc application.
   * Must be called before convertProject().
   *
   * @returns Promise that resolves when initialization completes
   */
  public async initialize(): Promise<void> {
    if (this.app) {
      throw new Error('Engine already initialized');
    }

    // Bootstrap TypeDoc application with minimal configuration
    // If entryPoints are specified, use them; otherwise TypeDoc uses tsconfig's include patterns
    const bootstrapOptions: TypeDocOptions = {
      tsconfig: this.options.tsconfig,
      entryPointStrategy: 'expand',
      excludePrivate: this.options.excludePrivate ?? false,
      excludeProtected: this.options.excludeProtected ?? false,
      excludeInternal: this.options.excludeInternal ?? false,
      skipErrorChecking: this.options.skipErrorChecking ?? true,
      logLevel: LogLevel.Error, // Suppress TypeDoc output
      excludeExternals: true, // Don't analyze node_modules
      excludeReferences: true, // Don't follow external references
    };

    // Add entryPoints if specified
    if (this.options.entryPoints && this.options.entryPoints.length > 0) {
      bootstrapOptions.entryPoints = this.options.entryPoints;
    }

    this.app = await Application.bootstrapWithPlugins(bootstrapOptions);
  }

  /**
   * Convert the TypeScript project and collect symbols
   *
   * @returns TypeDoc project reflection
   */
  public async convertProject(): Promise<ProjectReflection> {
    if (!this.app) {
      throw new Error('Engine not initialized. Call initialize() first.');
    }

    // Create TypeScript program for enhancement support
    // We create our own program from the same tsconfig used by TypeDoc
    // This is simpler than trying to hook into TypeDoc's internal event system
    this.program = this.createTypeScriptProgram();
    if (this.program) {
      this.checker = this.program.getTypeChecker();
    }

    // Run TypeDoc conversion
    const project = await this.app.convert();
    if (!project) {
      throw new Error('TypeDoc conversion failed - no project returned');
    }

    this.project = project;

    // Pass program and checker to SymbolCollector for enhancement support
    if (this.program && this.checker) {
      this.symbolCollector.setTypeScriptContext(project, this.program, this.checker);
    }

    // Collect symbols from the project
    this.symbols = this.symbolCollector.collectFromProject(project);

    return project;
  }

  /**
   * Create TypeScript program from tsconfig
   * This provides access to the TypeScript compiler API for enhancers
   *
   * @returns TypeScript program or null if creation fails
   */
  private createTypeScriptProgram(): ts.Program | null {
    try {
      // Read and parse tsconfig
      const configFile = ts.readConfigFile(this.options.tsconfig, (path) =>
        readFileSync(path, 'utf8'),
      );

      if (configFile.error) {
        console.warn('Warning: Failed to read tsconfig for enhancement support');
        return null;
      }

      // Parse compiler options
      const parsedConfig = ts.parseJsonConfigFileContent(
        configFile.config,
        ts.sys,
        dirname(this.options.tsconfig),
      );

      if (parsedConfig.errors.length > 0) {
        console.warn('Warning: Failed to parse tsconfig for enhancement support');
        return null;
      }

      // Create program with ALL files from tsconfig (not just targeted entryPoints)
      // This is crucial for enhancement: we need the full program to find references
      // across the entire codebase, not just within the targeted file.
      // TypeDoc uses this.options.entryPoints for efficient symbol collection,
      // but the TypeScript program needs all files to support ReferenceEnhancer.
      const rootNames = parsedConfig.fileNames;

      return ts.createProgram({
        rootNames,
        options: parsedConfig.options,
      });
    } catch (error) {
      console.warn('Warning: Failed to create TypeScript program for enhancement support:', error);
      return null;
    }
  }

  /**
   * Get all collected symbols
   *
   * @returns Array of symbol metadata
   */
  public getSymbols(): SymbolMetadata[] {
    return this.symbols;
  }

  /**
   * Get the TypeDoc project reflection (if conversion has been run)
   *
   * @returns TypeDoc project reflection or null if not yet converted
   */
  public getProject(): ProjectReflection | null {
    return this.project;
  }

  /**
   * Get the tsconfig path used by this engine
   *
   * @returns Absolute path to tsconfig.json
   */
  public getTsconfigPath(): string {
    return this.options.tsconfig;
  }

  /**
   * Get the symbol collector instance (for accessing enhancement context)
   *
   * @returns SymbolCollector instance
   */
  public getSymbolCollector(): SymbolCollector {
    return this.symbolCollector;
  }

  /**
   * Cleanup resources
   *
   * @returns void
   */
  public cleanup(): void {
    this.app = null;
    this.project = null;
    this.symbols = [];
    this.program = null;
    this.checker = null;
  }
}
