import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import pino from 'pino';

// force vitest to use CI mode to avoid watch mode
process.env.CI = 'true';

// Setup minimal console logging for tests (warn level to reduce noise)
const testLogger = pino({ level: process.env.LOG_LEVEL || 'warn' });
(['debug', 'info', 'warn', 'error', 'log'] as const).forEach((name) => {
  // eslint-disable-next-line no-console
  console[name] = (...args: unknown[]) => {
    testLogger[name === 'log' ? 'debug' : name]?.(args);
  };
});

export default defineConfig({
  // @ts-expect-error type mismatch in packages
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
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
