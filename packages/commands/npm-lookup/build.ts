#!/usr/bin/env tsx
import { build, type BuildOptions } from 'esbuild';
import { execSync } from 'child_process';

const outdir = 'dist';

// Shared build options
const sharedOptions: BuildOptions = {
  bundle: true,
  platform: 'node',
  packages: 'external',
  target: 'node22',
};

async function buildAll() {
  console.log('🔨 Building @mcp-funnel/command-npm-lookup...\n');

  // Build TypeScript types
  console.log('📦 Building TypeScript types...');
  execSync(
    'tsc  --emitDeclarationOnly --declaration --declarationMap --project tsconfig.build.json',
    {
      stdio: 'inherit',
    },
  );

  console.log('📦 Bundling ESM...');
  await build({
    ...sharedOptions,
    entryPoints: ['src/index.ts'],
    format: 'esm',
    outfile: `${outdir}/index.js`,
  });

  console.log('\n✅ Build complete!');
}

buildAll().catch((error) => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});
