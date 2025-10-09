/**
 * Test suite for SymbolCollector
 *
 * Focuses on testing the generateStableId method through the public collect() method
 */

import { describe, it, expect } from 'vitest';
import { Application, ReflectionKind, type DeclarationReflection } from 'typedoc';
import { SymbolCollector } from './symbolCollector.js';
import type { SymbolMetadata } from '../types/symbols.js';
import { resolve } from 'path';

describe('SymbolCollector', () => {
  describe('generateStableId', () => {
    it('should generate hash-based ID for top-level symbol (class)', async () => {
      // Project root is the directory containing tsconfig.json
      const projectRoot = resolve(process.cwd());

      // Create a TypeDoc application and convert the symbolCollector file itself
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

      // Get the SymbolCollector class reflection
      const classes = project.getReflectionsByKind(ReflectionKind.Class) as DeclarationReflection[];
      const symbolCollectorClass = classes.find((c) => c.name === 'SymbolCollector');

      expect(symbolCollectorClass).toBeDefined();

      if (!symbolCollectorClass) {
        throw new Error('SymbolCollector class not found in reflections');
      }

      // Collect metadata using SymbolCollector with project root
      const collector = new SymbolCollector(projectRoot);
      const metadata: SymbolMetadata = collector.collect(symbolCollectorClass);

      // Verify ID is 8-character base64url hash
      expect(metadata.id).toBeDefined();
      expect(metadata.id).toMatch(/^[A-Za-z0-9_-]{8}$/);

      // Test determinism: same reflection should produce same ID
      const metadata2 = collector.collect(symbolCollectorClass);
      expect(metadata2.id).toBe(metadata.id);

      // Verify other metadata is still correct
      expect(metadata.name).toBe('SymbolCollector');
      expect(metadata.kind).toBe(ReflectionKind.Class);
      expect(metadata.filePath).toMatch(/symbolCollector\.ts$/);
      expect(metadata.line).toBeGreaterThan(0);
    });

    it('should generate unique hash-based ID for nested symbol (method with parent chain)', async () => {
      // Project root is the directory containing tsconfig.json
      const projectRoot = resolve(process.cwd());

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

      // Get the SymbolCollector class
      const classes = project.getReflectionsByKind(ReflectionKind.Class) as DeclarationReflection[];
      const symbolCollectorClass = classes.find((c) => c.name === 'SymbolCollector');

      expect(symbolCollectorClass).toBeDefined();
      expect(symbolCollectorClass?.children).toBeDefined();
      expect(symbolCollectorClass?.children?.length).toBeGreaterThan(0);

      // Find the collect method (a public method)
      const collectMethod = symbolCollectorClass?.children?.find((m) => m.name === 'collect');

      expect(collectMethod).toBeDefined();

      if (!collectMethod) {
        throw new Error('collect method not found in SymbolCollector class');
      }

      // Collect metadata for the method with project root
      const collector = new SymbolCollector(projectRoot);
      const methodMetadata: SymbolMetadata = collector.collect(collectMethod);

      // Verify ID is 8-character base64url hash
      expect(methodMetadata.id).toBeDefined();
      expect(methodMetadata.id).toMatch(/^[A-Za-z0-9_-]{8}$/);

      // Test determinism: same reflection should produce same ID
      const methodMetadata2 = collector.collect(collectMethod);
      expect(methodMetadata2.id).toBe(methodMetadata.id);

      // Test uniqueness: parent and child should have different IDs
      if (!symbolCollectorClass) {
        throw new Error('SymbolCollector class not found for parent comparison');
      }
      const parentMetadata = collector.collect(symbolCollectorClass);
      expect(methodMetadata.id).not.toBe(parentMetadata.id);

      // Verify other metadata is still correct
      expect(methodMetadata.name).toBe('collect');
      expect(methodMetadata.kind).toBe(ReflectionKind.Method);
      expect(methodMetadata.filePath).toMatch(/symbolCollector\.ts$/);
      expect(methodMetadata.line).toBeGreaterThan(0);
      expect(methodMetadata.parentId).toBe(parentMetadata.id);
    });

    it('should generate hash-based ID for symbol with missing source information', async () => {
      // Project root is the directory containing tsconfig.json
      const projectRoot = resolve(process.cwd());

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

      // Get all reflections and find one without source info
      // TypeDoc's internal types or external references often lack source info
      const allReflections = project.getReflectionsByKind(ReflectionKind.All);

      // Find a reflection without sources
      const reflectionWithoutSource = allReflections.find((r) => {
        const decl = r as DeclarationReflection;
        return !decl.sources || decl.sources.length === 0;
      });

      // If we can't find one naturally, we'll test by manually creating a scenario
      // by using the project itself (which typically has no source location)
      const testReflection = reflectionWithoutSource || project;

      const collector = new SymbolCollector(projectRoot);
      const metadata: SymbolMetadata = collector.collect(testReflection);

      // Verify ID is still 8-character base64url hash even without source
      expect(metadata.id).toBeDefined();
      expect(metadata.id).toMatch(/^[A-Za-z0-9_-]{8}$/);

      // Test determinism even for symbols without source
      const metadata2 = collector.collect(testReflection);
      expect(metadata2.id).toBe(metadata.id);

      // Verify metadata properties
      expect(metadata.name).toBeTruthy();
      expect(typeof metadata.kind).toBe('number');
      // filePath and line should be undefined for symbols without source
      expect(metadata.filePath).toBeUndefined();
      expect(metadata.line).toBeUndefined();
    });
  });
});
