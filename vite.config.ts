import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 : build en un seul fichier HTML (publication en artifact / test rapide).
// Sinon : build classique multi-fichiers (déploiement PWA).
export default defineConfig({
  plugins: process.env.SINGLE ? [viteSingleFile()] : [],
  build: { target: 'es2022', sourcemap: false, minify: 'esbuild' },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      // seuil de la porte de phase 1 (PLAN.md §5) : la sim est testée comme un backend
      provider: 'v8',
      include: ['src/sim/**'],
      exclude: ['**/*.test.ts'],
      reporter: ['text-summary', 'lcov'],
      thresholds: { statements: 80, lines: 80, functions: 80, branches: 70 },
    },
  },
});
