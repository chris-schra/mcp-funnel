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

    // Create formatter with projectRoot for stable IDs
    const formatter = new YAMLDescribeFileFormatter({
      summaryExtractor: new PassthroughSummaryExtractor(),
      includeMembers: true,
    });

    // Format as YAML with projectRoot
    const yaml = formatter.format(reflections, {
      projectRoot: process.cwd(),
    });

    // Verify YAML structure includes all required fields
    expect(yaml).toContain('symbols:');
    expect(yaml).toContain('id:');
    expect(yaml).toContain('inline:');
    expect(yaml).toContain('line:');

    // Verify it includes our YAMLDescribeFileFormatter class
    expect(yaml).toContain('class YAMLDescribeFileFormatter');

    // Verify ID format (8-character base64url hash)
    const idPattern = /id:\s*"?([A-Za-z0-9_-]{8})"?/;
    const idMatch = yaml.match(idPattern);
    expect(idMatch).toBeTruthy();
    expect(idMatch?.[1]).toHaveLength(8);

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
    const yaml = formatter.format(reflections, {
      projectRoot: process.cwd(),
    });

    // Should have docLines for documented symbols
    expect(yaml).toContain('docLines:');
    // Verify id field is present
    expect(yaml).toContain('id:');

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
    const yaml = formatter.format([summaryExtractorInterface!], {
      projectRoot: process.cwd(),
    });

    // Should have id field
    expect(yaml).toContain('id:');
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
    const yaml = formatter.format(reflections, {
      projectRoot: process.cwd(),
    });

    // Should have id field
    expect(yaml).toContain('id:');
    // Should NOT have members
    expect(yaml).not.toContain('members:');

    console.log('YAML without members:');
    console.log(yaml);
  });
});
