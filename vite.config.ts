import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 : build en un seul fichier HTML (publication en artifact / test rapide).
// Sinon : build classique multi-fichiers (déploiement PWA).
export default defineConfig({
  plugins: process.env.SINGLE ? [viteSingleFile()] : [],
  build: { target: 'es2022', sourcemap: false, minify: 'esbuild' },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
