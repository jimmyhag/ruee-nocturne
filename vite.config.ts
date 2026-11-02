import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';

// SINGLE=1 : build en un seul fichier HTML (publication en artifact / test rapide), sans PWA.
// Sinon : build classique multi-fichiers + manifest + service worker (déploiement).
const SINGLE = !!process.env.SINGLE;

export default defineConfig({
  plugins: [
    ...(SINGLE ? [viteSingleFile()] : []),
    VitePWA({
      disable: SINGLE,
      registerType: 'prompt', // on ne force jamais une mise à jour en pleine partie (skill pwa-release §2)
      injectRegister: null, // enregistrement explicite dans src/platform/pwa.ts
      manifest: {
        id: '/',
        name: 'Ruée Nocturne',
        short_name: 'Ruée',
        description: 'Survis à la horde : armes automatiques, saut, dash et améliorations.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#1c1226',
        theme_color: '#1c1226',
        categories: ['games'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [
          { src: 'screenshots/mobile.png', sizes: '1170x1992', type: 'image/png', form_factor: 'narrow' },
          { src: 'screenshots/desktop.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,ogg,m4a,json,webmanifest}'],
        globIgnores: ['screenshots/**'], // fiche d'installation seulement, inutile hors ligne
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-css',
              expiration: { maxEntries: 8, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-files',
              expiration: { maxEntries: 16, maxAgeSeconds: 365 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2022', sourcemap: false, minify: 'esbuild' },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000, // sous --coverage la sim instrumentée est ~6× plus lente (CI : 3600 steps ≈ 3 s)
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
