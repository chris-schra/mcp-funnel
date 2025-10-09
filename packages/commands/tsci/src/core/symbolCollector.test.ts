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
    it('should generate correct ID format for top-level symbol (class)', async () => {
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

      // Verify ID format: path.to.symbol:kind:file:line
      // For top-level class: ClassName:kind:file:line
      expect(metadata.id).toBeDefined();

      // Parse the ID to verify structure
      const idParts = metadata.id.split(':');
      expect(idParts.length).toBe(4); // path, kind, file, line

      // Verify components
      expect(idParts[0]).toContain('SymbolCollector'); // Symbol path
      expect(idParts[1]).toBe(String(ReflectionKind.Class)); // Kind should be Class
      // File path should be relative to project root
      expect(idParts[2]).toBe('packages/commands/tsci/src/core/symbolCollector.ts');
      expect(idParts[3]).toMatch(/^\d+$/); // Line number should be numeric
    });

    it('should generate correct ID format for nested symbol (method with parent chain)', async () => {
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
      const metadata: SymbolMetadata = collector.collect(collectMethod);

      // Verify ID format includes parent chain: ParentClass.methodName:kind:file:line
      expect(metadata.id).toBeDefined();

      const idParts = metadata.id.split(':');
      expect(idParts.length).toBe(4); // path, kind, file, line

      // Verify the hierarchical path includes parent
      expect(idParts[0]).toContain('SymbolCollector.collect'); // Should have parent.child format
      expect(idParts[1]).toBe(String(ReflectionKind.Method)); // Kind should be Method
      // File path should be relative to project root
      expect(idParts[2]).toBe('packages/commands/tsci/src/core/symbolCollector.ts');
      expect(idParts[3]).toMatch(/^\d+$/); // Line number should be numeric
    });

    it('should generate correct ID format for symbol with missing source information', async () => {
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

      // Verify ID format with empty location: path.to.symbol:kind::
      // (note the double colon indicating missing file:line)
      expect(metadata.id).toBeDefined();

      const idParts = metadata.id.split(':');

      // Should still have the parts structure, but file and line should be empty
      // Format: name:kind::
      expect(idParts.length).toBeGreaterThanOrEqual(3);
      expect(idParts[0]).toBeTruthy(); // Name should exist
      expect(idParts[1]).toMatch(/^\d+$/); // Kind should be numeric
      // Last part (after final colon) should be empty when no source
      expect(metadata.id).toMatch(/:$/); // Should end with colon when location is empty
    });
  });
});
