// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    ignores: ['**/generated/*', '**/dist/*', '**/build/*', '**/coverage/*'],
  },
  {
    rules: {
      'no-console': [
        'error',
        {
          allow: ['warn', 'error', 'debug', 'info'], // Allow console.warn, console.error, console.debug, and console.info
        },
      ],
      '@typescript-eslint/no-namespace': [
        'error',
        {
          allowDeclarations: true,
        },
      ],
      // Handle unused variables and parameters more intelligently
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'after-used', // Allow unused params if they come after used ones
          argsIgnorePattern: '^_', // Ignore parameters starting with underscore
          varsIgnorePattern: '^_', // Ignore variables starting with underscore
          ignoreRestSiblings: true, // Ignore unused vars in object destructuring rest
          destructuredArrayIgnorePattern: '^_', // Ignore unused array destructuring elements starting with _
          caughtErrors: 'all', // Check caught error arguments
          caughtErrorsIgnorePattern: '^_', // Ignore caught errors starting with _
        },
      ],
    },
  },
  {
    // Override for scripts, snippet, and validate files - allow more console methods but still restrict console.log
    files: ['scripts/**/*', 'services/snippet/src/snippet.ts', 'validate.ts'],
    rules: {
      'no-console': [
        'error',
        {
          allow: ['warn', 'error', 'debug', 'info'], // Allow all except console.log
        },
      ],
    },
  },
  {
    // Override for test files, build scripts, and demos
    files: [
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/build.ts',
      '**/demo.ts',
      '**/__tests__/**',
      '**/test/**',
    ],
    rules: {
      'no-console': 'off', // Allow console usage in tests and build scripts
    },
  },
  {
    // Explicit override for synthetic loader fixtures (CommonJS modules used by e2e loader tests)
    // We lint them with CommonJS globals and script sourceType instead of ignoring them.
    // Rationale: keep fixtures under lint while avoiding noisy no-undef for CJS patterns
    files: ['packages/agents/core/test-fixtures/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        module: 'readonly',
        exports: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        process: 'readonly',
      },
    },
    rules: {
      // Allow console in fixtures if used for test signaling
      'no-console': 'off',
    },
  },
);
