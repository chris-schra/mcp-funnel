/**
 * Test for YAMLDescribeFileFormatter
 *
 * Demonstrates the YAML output format with a sample TypeScript file
 */

import { describe, it, expect } from 'vitest';
import { type DeclarationReflection, Application, ReflectionKind } from 'typedoc';
import { YAMLDescribeFileFormatter } from './yamlDescribeFileFormatter.js';
import { PassthroughSummaryExtractor } from '../core/summaryExtractor.js';

describe('YAMLDescribeFileFormatter', () => {
  it('should format reflections as YAML with all required fields', async () => {
    // Create a minimal TypeDoc application
    const app = await Application.bootstrapWithPlugins({
      entryPoints: ['packages/commands/tsci/src/formatters/yamlDescribeFileFormatter.ts'],
      tsconfig: 'tsconfig.json',
      excludeExternals: true,
      excludeReferences: true,
      skipErrorChecking: true,
    });

    // Convert the project
    const project = await app.convert();
    expect(project).toBeDefined();

    if (!project) {
      throw new Error('Project conversion failed');
    }

    // Get reflections for classes and interfaces
    const reflections = project.getReflectionsByKind(
      ReflectionKind.Class | ReflectionKind.Interface | ReflectionKind.Function,
    ) as DeclarationReflection[];

    expect(reflections.length).toBeGreaterThan(0);

    // Create formatter
    const formatter = new YAMLDescribeFileFormatter({
      summaryExtractor: new PassthroughSummaryExtractor(),
      includeMembers: true,
    });

    // Format as YAML
    const yaml = formatter.format(reflections);

    // Verify YAML structure
    expect(yaml).toContain('symbols:');
    expect(yaml).toContain('inline:');
    expect(yaml).toContain('line:');

    // Verify it includes our YAMLDescribeFileFormatter class
    expect(yaml).toContain('class YAMLDescribeFileFormatter');

    // Log the output for manual inspection
    console.log('YAML Output Sample:');
    console.log(yaml);
  });

  it('should include docLines when JSDoc comment exists', async () => {
    const app = await Application.bootstrapWithPlugins({
      entryPoints: ['packages/commands/tsci/src/core/summaryExtractor.ts'],
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

    const reflections = project.getReflectionsByKind(
      ReflectionKind.Interface | ReflectionKind.Class,
    ) as DeclarationReflection[];

    const formatter = new YAMLDescribeFileFormatter();
    const yaml = formatter.format(reflections);

    // Should have docLines for documented symbols
    expect(yaml).toContain('docLines:');

    console.log('YAML with docLines:');
    console.log(yaml);
  });

  it('should include members for interfaces and classes', async () => {
    const app = await Application.bootstrapWithPlugins({
      entryPoints: ['packages/commands/tsci/src/core/summaryExtractor.ts'],
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

    // Get SummaryExtractor interface
    const reflections = project.getReflectionsByKind(
      ReflectionKind.Interface,
    ) as DeclarationReflection[];

    const summaryExtractorInterface = reflections.find((r) => r.name === 'SummaryExtractor');
    expect(summaryExtractorInterface).toBeDefined();

    const formatter = new YAMLDescribeFileFormatter({ includeMembers: true });
    const yaml = formatter.format([summaryExtractorInterface!]);

    // Should have members
    expect(yaml).toContain('members:');
    expect(yaml).toContain('extract');
    expect(yaml).toContain('#L'); // Line references

    console.log('YAML with members:');
    console.log(yaml);
  });

  it('should exclude members when includeMembers is false', async () => {
    const app = await Application.bootstrapWithPlugins({
      entryPoints: ['packages/commands/tsci/src/core/summaryExtractor.ts'],
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

    const reflections = project.getReflectionsByKind(
      ReflectionKind.Interface,
    ) as DeclarationReflection[];

    const formatter = new YAMLDescribeFileFormatter({ includeMembers: false });
    const yaml = formatter.format(reflections);

    // Should NOT have members
    expect(yaml).not.toContain('members:');

    console.log('YAML without members:');
    console.log(yaml);
  });
});
