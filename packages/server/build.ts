import * as esbuild from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 *
 */
async function build() {
  const isWatch = process.argv.includes('--watch');

  const buildOptions: esbuild.BuildOptions = {
    entryPoints: [join(__dirname, 'src/index.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: join(__dirname, 'dist/index.js'),
    external: ['mcp-funnel', 'ws'],
    sourcemap: true,
    minify: !isWatch,
    logLevel: 'info',
  };

  if (isWatch) {
    const context = await esbuild.context(buildOptions);
    await context.watch();
    console.log('Watching for changes...');
  } else {
    await esbuild.build(buildOptions);
    console.log('Build complete');
  }
}

build().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});


