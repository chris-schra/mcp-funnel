/**
 * Simplified TypeDoc engine wrapper for tsci command
 * Single-shot conversion only (no watch mode, no events)
 * Cherry-picked from POC's engine.ts and cli.ts
 */

import { Application, LogLevel, type ProjectReflection } from 'typedoc';
import type { EngineOptions, SymbolMetadata } from '../types/index.js';
import { SymbolCollector } from './symbolCollector.js';

/**
 * TypeDoc engine wrapper that provides single-shot conversion
 * and symbol collection functionality
 */
export class TypeDocEngine {
  private app: Application | null = null;
  private project: ProjectReflection | null = null;
  private symbolCollector: SymbolCollector;
  private symbols: SymbolMetadata[] = [];

  public constructor(private options: EngineOptions) {
    this.symbolCollector = new SymbolCollector();
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
    const bootstrapOptions: any = {
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

    // Run TypeDoc conversion
    const project = await this.app.convert();
    if (!project) {
      throw new Error('TypeDoc conversion failed - no project returned');
    }

    this.project = project;

    // Collect symbols from the project
    this.symbols = this.symbolCollector.collectFromProject(project);

    return project;
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
   * Cleanup resources
   *
   * @returns void
   */
  public cleanup(): void {
    this.app = null;
    this.project = null;
    this.symbols = [];
  }
}
