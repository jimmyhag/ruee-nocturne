// ESLint flat config : règles TS recommandées + Prettier (le formatage n'est pas un lint).
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-single/**',
      'dev-dist/**',
      'node_modules/**',
      'prototype/**', // référence historique, jamais touchée
      'shots/**',
      'sim/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // les pools et la boucle chaude utilisent volontairement des variables préfixées _
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // outillage et tests : `any` toléré pour lire du JSON de sortie
    files: ['tools/**/*.ts', 'e2e/**/*.ts', 'src/**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  prettier,
);
