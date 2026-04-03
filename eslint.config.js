/**
 * ESLint flat config for the tower defense game.
 *
 * Uses ESLint 9 flat config format with typescript-eslint for
 * TypeScript-aware linting. Rules are tuned for game development:
 * - No unused variables (prevents dead code accumulation across 9 systems)
 * - Explicit return types on exported functions (system APIs must be typed)
 * - No explicit any (forces proper typing of cross-system interfaces)
 */
import tseslint from 'typescript-eslint';

export default tseslint.config(
  /* Base recommended rules for TypeScript. */
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.ts'],
    rules: {
      /* -- Type Safety --
       * Cross-system interfaces are the highest-risk surface in this game.
       * Disallow 'any' to force explicit typing at system boundaries. */
      '@typescript-eslint/no-explicit-any': 'error',

      /* Unused variables indicate dead code. In a 9-system game, dead code
       * in one system often means a broken integration with another. */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],

      /* -- Code Quality -- */
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
  },

  {
    /* Test files have relaxed rules -- mocking often requires 'any'. */
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  {
    /* Ignore build output and config files. */
    ignores: ['dist/', 'node_modules/', '*.config.js', '*.config.ts'],
  }
);
