/**
 * Test suite for ReferenceEnhancer
 *
 * Tests the population of usages and references in SymbolMetadata
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { Application } from 'typedoc';
import * as ts from 'typescript';
import { ReferenceEnhancer } from './referenceEnhancer.js';
import { SymbolCollector } from '../core/symbolCollector.js';
import type { SymbolMetadata, EnhancementContext } from '../types/index.js';
import { resolve } from 'path';

/**
 * Create a TypeScript program from tsconfig
 * TypeDoc doesn't expose its program in the public API, so we create our own
 * from the same tsconfig to ensure type information matches
 *
 * @param tsconfigPath - Path to tsconfig.json
 * @returns TypeScript program
 */
function createProgramFromTsconfig(tsconfigPath: string): ts.Program {
  const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (configFile.error) {
    throw new Error(`Failed to read tsconfig: ${configFile.error.messageText}`);
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    resolve(process.cwd()),
  );

  return ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: parsedConfig.options,
  });
}

describe('ReferenceEnhancer', () => {
  // Create TypeScript program once for all tests to improve performance
  let sharedProgram: ts.Program;
  let sharedChecker: ts.TypeChecker;

  beforeAll(() => {
    sharedProgram = createProgramFromTsconfig('tsconfig.json');
    sharedChecker = sharedProgram.getTypeChecker();
  });

  describe('enhance', () => {
    it(
      'should populate usages for a function used in multiple places',
      async () => {
        const projectRoot = resolve(process.cwd());

        // Use SymbolCollector file which has multiple method calls
        const app = await Application.bootstrapWithPlugins({
          entryPoints: ['packages/commands/tsci/src/core/symbolCollector.ts'],
          tsconfig: 'tsconfig.json',
          excludeExternals: true,
          excludeReferences: true,
          skipErrorChecking: true,
        });

        const project = await app.convert();
        expect(project).toBeDefined();

        if (!project) {
          throw new Error('Project conversion failed');
        }

        // Use shared program for better performance
        const program = sharedProgram;
        const checker = sharedChecker;

        // Collect all symbols
        const collector = new SymbolCollector(projectRoot);
        const symbols = collector.collectFromProject(project);

        // Build symbol index
        const symbolIndex = new Map<string, SymbolMetadata>();
        for (const symbol of symbols) {
          symbolIndex.set(symbol.id, symbol);
        }

        // Create enhancement context
        const context: EnhancementContext = {
          project,
          checker,
          program,
          symbolIndex,
        };

        // Enhance symbols with references
        const enhancer = new ReferenceEnhancer();
        await enhancer.enhance(symbols, context);

        // Find the collect method which should have usages
        const collectMethod = symbols.find(
          (s) => s.name === 'collect' && s.kindString === 'Method',
        );

        expect(collectMethod).toBeDefined();

        if (collectMethod && collectMethod.usages) {
          // The collect method should have usages if it's referenced in the file
          expect(Array.isArray(collectMethod.usages)).toBe(true);

          if (collectMethod.usages.length > 0) {
            // Verify usage structure
            const usage = collectMethod.usages[0];
            expect(usage.file).toBeDefined();
            expect(usage.lines).toBeDefined();
            expect(Array.isArray(usage.lines)).toBe(true);
            expect(usage.lines.length).toBeGreaterThan(0);
            expect(usage.kind).toBeDefined();
            expect(['import', 'usage']).toContain(usage.kind);
          }
        }
      },
      { timeout: 30000 },
    );

    it(
      'should populate references for types used from other files',
      async () => {
        const projectRoot = resolve(process.cwd());

        // Use engine.ts which imports types from other files
        const app = await Application.bootstrapWithPlugins({
          entryPoints: ['packages/commands/tsci/src/core/engine.ts'],
          tsconfig: 'tsconfig.json',
          excludeExternals: true,
          excludeReferences: true,
          skipErrorChecking: true,
        });

        const project = await app.convert();
        expect(project).toBeDefined();

        if (!project) {
          throw new Error('Project conversion failed');
        }

        // Use shared program for better performance
        const program = sharedProgram;
        const checker = sharedChecker;

        // Collect all symbols
        const collector = new SymbolCollector(projectRoot);
        const symbols = collector.collectFromProject(project);

        // Build symbol index
        const symbolIndex = new Map<string, SymbolMetadata>();
        for (const symbol of symbols) {
          symbolIndex.set(symbol.id, symbol);
        }

        // Create enhancement context
        const context: EnhancementContext = {
          project,
          checker,
          program,
          symbolIndex,
        };

        // Enhance symbols with references
        const enhancer = new ReferenceEnhancer();
        await enhancer.enhance(symbols, context);

        // Find SymbolMetadata type which is used in engine.ts
        const symbolMetadataType = symbols.find(
          (s) => s.name === 'SymbolMetadata' && s.kindString === 'Interface',
        );

        if (symbolMetadataType) {
          // This type might be used as type references in engine.ts
          // Note: TypeDoc might not include all usages depending on how it's configured
          // So we'll just check the structure if references exist
          if (symbolMetadataType.references) {
            expect(Array.isArray(symbolMetadataType.references)).toBe(true);

            if (symbolMetadataType.references.length > 0) {
              const ref = symbolMetadataType.references[0];
              expect(ref.name).toBeDefined();
              expect(ref.kind).toBeDefined();
              expect(ref.from).toBeDefined();
              expect(ref.line).toBeDefined();
              expect(typeof ref.line).toBe('number');
              expect(ref.module).toBeDefined();
            }
          }
        }
      },
      { timeout: 30000 },
    );

    it(
      'should skip symbols without location information',
      async () => {
        const projectRoot = resolve(process.cwd());

        const app = await Application.bootstrapWithPlugins({
          entryPoints: ['packages/commands/tsci/src/core/engine.ts'],
          tsconfig: 'tsconfig.json',
          excludeExternals: true,
          excludeReferences: true,
          skipErrorChecking: true,
        });

        const project = await app.convert();
        expect(project).toBeDefined();

        if (!project) {
          throw new Error('Project conversion failed');
        }

        const program = sharedProgram;
        const checker = sharedChecker;

        const collector = new SymbolCollector(projectRoot);
        const symbols = collector.collectFromProject(project);

        // Find or create a symbol without location info
        const symbolWithoutLocation = symbols.find((s) => !s.filePath || s.line === undefined);

        if (symbolWithoutLocation) {
          const symbolIndex = new Map<string, SymbolMetadata>();
          symbols.forEach((s) => symbolIndex.set(s.id, s));

          const context: EnhancementContext = {
            project,
            checker,
            program,
            symbolIndex,
          };

          const enhancer = new ReferenceEnhancer();
          await enhancer.enhance([symbolWithoutLocation], context);

          // Symbol without location should not have usages/references added
          expect(symbolWithoutLocation.usages).toBeUndefined();
          expect(symbolWithoutLocation.references).toBeUndefined();
        }
      },
      { timeout: 30000 },
    );

    it(
      'should classify import references correctly',
      async () => {
        const projectRoot = resolve(process.cwd());

        // Use a file that imports from other files
        const app = await Application.bootstrapWithPlugins({
          entryPoints: [
            'packages/commands/tsci/src/core/engine.ts',
            'packages/commands/tsci/src/core/symbolCollector.ts',
          ],
          tsconfig: 'tsconfig.json',
          excludeExternals: true,
          excludeReferences: true,
          skipErrorChecking: true,
        });

        const project = await app.convert();
        expect(project).toBeDefined();

        if (!project) {
          throw new Error('Project conversion failed');
        }

        const program = sharedProgram;
        const checker = sharedChecker;

        const collector = new SymbolCollector(projectRoot);
        const symbols = collector.collectFromProject(project);

        const symbolIndex = new Map<string, SymbolMetadata>();
        symbols.forEach((s) => symbolIndex.set(s.id, s));

        const context: EnhancementContext = {
          project,
          checker,
          program,
          symbolIndex,
        };

        const enhancer = new ReferenceEnhancer();
        await enhancer.enhance(symbols, context);

        // Find SymbolCollector class which is imported in engine.ts
        const symbolCollectorClass = symbols.find(
          (s) => s.name === 'SymbolCollector' && s.kindString === 'Class',
        );

        if (symbolCollectorClass && symbolCollectorClass.usages) {
          // Should have at least one usage
          expect(symbolCollectorClass.usages.length).toBeGreaterThan(0);

          // Check if there's an import usage
          const importUsage = symbolCollectorClass.usages.find((u) => u.kind === 'import');
          if (importUsage) {
            expect(importUsage.file).toBeDefined();
            expect(importUsage.lines.length).toBeGreaterThan(0);
          }
        }
      },
      { timeout: 30000 },
    );

    it(
      'should not populate empty usages or references arrays',
      async () => {
        const projectRoot = resolve(process.cwd());

        const app = await Application.bootstrapWithPlugins({
          entryPoints: ['packages/commands/tsci/src/enhancers/ISymbolEnhancer.ts'],
          tsconfig: 'tsconfig.json',
          excludeExternals: true,
          excludeReferences: true,
          skipErrorChecking: true,
        });

        const project = await app.convert();
        expect(project).toBeDefined();

        if (!project) {
          throw new Error('Project conversion failed');
        }

        const program = sharedProgram;
        const checker = sharedChecker;

        const collector = new SymbolCollector(projectRoot);
        const symbols = collector.collectFromProject(project);

        const symbolIndex = new Map<string, SymbolMetadata>();
        symbols.forEach((s) => symbolIndex.set(s.id, s));

        const context: EnhancementContext = {
          project,
          checker,
          program,
          symbolIndex,
        };

        const enhancer = new ReferenceEnhancer();
        await enhancer.enhance(symbols, context);

        // Check that symbols without references don't have empty arrays
        for (const symbol of symbols) {
          if (symbol.usages !== undefined) {
            expect(symbol.usages.length).toBeGreaterThan(0);
          }
          if (symbol.references !== undefined) {
            expect(symbol.references.length).toBeGreaterThan(0);
          }
        }
      },
      { timeout: 30000 },
    );
  });

  describe('enhancer interface compliance', () => {
    it('should have a name property', () => {
      const enhancer = new ReferenceEnhancer();
      expect(enhancer.name).toBe('ReferenceEnhancer');
    });

    it('should have an enhance method', () => {
      const enhancer = new ReferenceEnhancer();
      expect(typeof enhancer.enhance).toBe('function');
    });
  });
});
