/**
 * Demo script for YAMLDescribeFileFormatter
 *
 * Demonstrates the YAML output format by analyzing the summaryExtractor.ts file
 */

import { Application, ReflectionKind, type DeclarationReflection } from 'typedoc';
import { YAMLDescribeFileFormatter } from './src/formatters/yamlDescribeFileFormatter.js';
import { PassthroughSummaryExtractor } from './src/core/summaryExtractor.js';

async function main() {
  console.log('📝 Demo: YAML Formatter Output\n');

  // Create TypeDoc application
  const app = await Application.bootstrapWithPlugins({
    entryPoints: ['packages/commands/tsci/src/core/summaryExtractor.ts'],
    tsconfig: 'packages/commands/tsci/tsconfig.json',
    excludeExternals: true,
    excludeReferences: true,
    excludePrivate: false,
    excludeProtected: false,
    skipErrorChecking: true, // Skip type checking errors in other packages
  });

  // Convert the project
  const project = await app.convert();
  if (!project) {
    throw new Error('TypeDoc conversion failed');
  }

  // Get all reflections (interfaces, classes, functions)
  const reflections = project.getReflectionsByKind(
    ReflectionKind.Interface | ReflectionKind.Class | ReflectionKind.Function,
  ) as DeclarationReflection[];

  console.log(`Found ${reflections.length} symbols\n`);

  // Create YAML formatter
  const formatter = new YAMLDescribeFileFormatter({
    summaryExtractor: new PassthroughSummaryExtractor(),
    includeMembers: true,
  });

  // Format as YAML
  const yaml = formatter.format(reflections);

  console.log('─'.repeat(80));
  console.log('YAML OUTPUT:');
  console.log('─'.repeat(80));
  console.log(yaml);
  console.log('─'.repeat(80));

  // Show token estimate
  const tokenEstimate = Math.ceil(yaml.length / 4);
  console.log(`\n📊 Token estimate: ~${tokenEstimate} tokens`);
  console.log(`📏 Character count: ${yaml.length}`);
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
