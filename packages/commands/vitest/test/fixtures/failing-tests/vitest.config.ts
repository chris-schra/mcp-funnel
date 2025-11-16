import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // IMPORTANT: Only include tests within this fixture directory
    // This prevents vitest from searching up and finding parent project tests
    include: ['**/*.test.ts', '**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
  },
});
