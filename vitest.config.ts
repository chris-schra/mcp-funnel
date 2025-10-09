import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// force vitest to use CI mode to avoid watch mode
process.env.CI = 'true';

export default defineConfig({
  // @ts-expect-error type mismatch in packages
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    // Use forks pool with reasonable concurrency limits
    // This prevents process explosion from nested vitest sessions
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        maxForks: 8, // Max 8 test files in parallel (reasonable for multi-core)
      },
    },
    // Limit concurrent tests within each file (prevents nested vitest explosion)
    maxConcurrency: 5,
    // Exclude fixture test files from being run as actual tests
    exclude: ['**/test/fixtures/**', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        '**/test/*',
        'src/cli.ts',
        '**/*.test.ts',
        '**/build.ts',
        '**/build/*',
        '**/dist/*',
        '**/.react-router/*',
        '**/*.config.ts',
      ],
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
