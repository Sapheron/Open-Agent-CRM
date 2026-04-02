// @ts-check
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Allow any for NestJS dynamic injection patterns
      '@typescript-eslint/no-explicit-any': 'warn',
      // Allow non-null assertions — common in NestJS guards
      '@typescript-eslint/no-non-null-assertion': 'warn',
      // Unused vars — error but allow leading underscore
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Require await on async functions
      '@typescript-eslint/require-await': 'warn',
      // Allow empty interfaces (common in NestJS DTOs)
      '@typescript-eslint/no-empty-object-type': 'off',
    },
  },
);
