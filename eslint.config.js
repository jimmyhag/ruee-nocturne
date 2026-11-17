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
      'lighthouse/**',
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
  // Frontières entre couches (harnais, 17 nov. 2026 ; CLAUDE.md, « Architecture » et règle 8). Le test
  // « frontière sim/render » de src/sim/sim.test.ts reste en place : la règle ESLint signale la faute dès l'édition.
  {
    // la simulation est pure et déterministe : ni Three.js, ni le DOM, ni les couches qui l'affichent ou la sauvent
    files: ['src/sim/**/*.ts'],
    ignores: ['src/sim/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'src/sim ne dépend pas de Three.js (rendu : src/render).' },
            { group: ['firebase', 'firebase/*'], message: 'Firebase vit seulement dans src/platform/account.ts.' },
            {
              group: ['**/render', '**/render/*', '**/ui', '**/ui/*', '**/platform', '**/platform/*'],
              message: 'src/sim ne connaît ni le rendu, ni l’interface, ni la plateforme : il émet des événements.',
            },
            {
              group: ['**/meta', '**/meta/*', '**/i18n', '**/i18n/*', '**/main', '**/debug'],
              message: 'src/sim ne connaît ni la sauvegarde, ni les textes (ils vivent côté UI), ni le point d’entrée.',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'document', message: 'Pas de DOM dans src/sim.' },
        { name: 'window', message: 'Pas de DOM dans src/sim.' },
        { name: 'navigator', message: 'Pas de DOM dans src/sim.' },
        { name: 'performance', message: 'Le temps de la sim vient de son pas fixe, pas de l’horloge.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Sim déterministe : tirer avec w.rng.' },
        { object: 'Date', property: 'now', message: 'Sim déterministe : le temps vient du pas fixe.' },
      ],
    },
  },
  {
    // le rendu lit le monde et dessine : il ne parle ni à l'interface, ni à la plateforme, ni à la sauvegarde
    files: ['src/render/**/*.ts'],
    ignores: ['src/render/**/*.test.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['firebase', 'firebase/*'], message: 'Firebase vit seulement dans src/platform/account.ts.' },
            {
              group: ['**/ui', '**/ui/*', '**/platform', '**/platform/*', '**/meta', '**/meta/*', '**/main'],
              message: 'src/render lit src/sim et dessine ; le reste passe par main.ts.',
            },
          ],
        },
      ],
    },
  },
  {
    // règle 8 : seul src/platform/account.ts charge Firebase (à la demande) ; un joueur sans compte n'émet rien
    files: ['src/**/*.ts'],
    ignores: ['src/sim/**', 'src/render/**', 'src/platform/account.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['firebase', 'firebase/*'], message: 'Firebase vit seulement dans src/platform/account.ts.' },
          ],
        },
      ],
    },
  },
  {
    // scripts Node en .mjs (Lighthouse) : globals de Node
    files: ['tools/**/*.mjs'],
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', fetch: 'readonly', setTimeout: 'readonly' },
    },
  },
  {
    // outillage et tests : `any` toléré pour lire du JSON de sortie
    files: ['tools/**/*.ts', 'e2e/**/*.ts', 'src/**/*.test.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  prettier,
);
