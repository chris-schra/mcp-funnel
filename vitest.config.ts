import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// force vitest to use CI mode to avoid watch mode
process.env.CI = "true";

export default defineConfig({
  // @ts-expect-error type mismatch in packages
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'test/', '*.config.ts', 'src/cli.ts'],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
