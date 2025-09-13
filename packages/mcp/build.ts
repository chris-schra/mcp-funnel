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
  console.log('🔨 Building mcp-funnel...\n');

  // Build TypeScript types
  console.log('📦 Building TypeScript types...');
  execSync('tsc --build', {
    stdio: 'inherit',
  });

  console.log('📦 Bundling...');
  await Promise.all([
    // Build ESM version
    build({
      ...sharedOptions,
      entryPoints: ['src/mcp-funnel.ts'],
      format: 'esm',
      outfile: `${outdir}/esm/index.js`,
    }),
    // Build CommonJS version
    build({
      ...sharedOptions,
      entryPoints: ['src/mcp-funnel.ts'],
      format: 'cjs',
      outfile: `${outdir}/cjs/index.cjs`,
    }),
    // Build CLI
    build({
      ...sharedOptions,
      entryPoints: ['src/cli.ts'],
      format: 'esm',
      outfile: `${outdir}/cli.js`,
      banner: {
        js: '#!/usr/bin/env node',
      },
    }),
  ]);

  console.log('\n✅ Build complete!');
}

buildAll().catch((error) => {
  console.error('❌ Build failed:', error);
  process.exit(1);
});
