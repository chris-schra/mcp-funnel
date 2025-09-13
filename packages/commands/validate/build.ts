#!/usr/bin/env tsx
import { build, type BuildOptions } from 'esbuild';
import { execSync } from 'child_process';

const outdir = 'dist';

// Shared build options
const sharedOptions: BuildOptions = {
  bundle: true,
  platform: 'node',
  packages: 'external',
  target: 'node18',
};

async function buildAll() {
  console.log('🔨 Building @mcp-funnel/ts-validate...\n');

  // Build TypeScript types
  console.log('📦 Building TypeScript types...');
  execSync('tsc --build', {
    stdio: 'inherit',
  });

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
