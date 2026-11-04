import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import pkg from './package.json' with { type: 'json' };

// SINGLE=1 : build en un seul fichier HTML (publication en artifact / test rapide), sans PWA.
// Sinon : build classique multi-fichiers + manifest + service worker (déploiement).
const SINGLE = !!process.env.SINGLE;

/**
 * Le module de rendu (three + src/render) est importé dynamiquement par main.ts pour que le menu soit interactif
 * sans l'évaluer (Lighthouse TBT). Vite ne précharge pas les imports dynamiques depuis le HTML : on injecte
 * nous-mêmes le <link rel="modulepreload"> du chunk pour que le téléchargement parte avec la page.
 */
/** Remplace %APP_VERSION% dans les pages HTML (la page « À propos » n'a pas de module JS pour lire `define`). */
function htmlVersion(): Plugin {
  return { name: 'ruee:html-version', transformIndexHtml: (html) => html.replace(/%APP_VERSION%/g, pkg.version) };
}

function preloadRenderChunk(): Plugin {
  return {
    name: 'ruee:preload-render-chunk',
    apply: 'build',
    enforce: 'post', // après vite:build-html : index.html est dans le bundle
    generateBundle(_opts, bundle) {
      let file = '';
      for (const [name, out] of Object.entries(bundle))
        if (out.type === 'chunk' && out.facadeModuleId?.replace(/\\/g, '/').endsWith('/src/render/scene.ts'))
          file = name;
      const html = bundle['index.html'];
      if (!file || !html || html.type !== 'asset' || typeof html.source !== 'string') return;
      html.source = html.source.replace(
        '</head>',
        `    <link rel="modulepreload" crossorigin href="/${file}" />\n  </head>`,
      );
    },
  };
}

export default defineConfig({
  plugins: [
    htmlVersion(),
    ...(SINGLE ? [viteSingleFile()] : [preloadRenderChunk()]),
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
          { src: 'screenshots/mobile.png', sizes: '1080x1920', type: 'image/png', form_factor: 'narrow' },
          { src: 'screenshots/desktop.png', sizes: '1920x1080', type: 'image/png', form_factor: 'wide' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,ogg,m4a,json,webmanifest}'],
        globIgnores: ['screenshots/**'], // fiche d'installation seulement, inutile hors ligne
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/__\//], // URL réservées de Firebase Hosting (/__/auth/handler, /__/firebase/init.json) : jamais index.html à leur place (phase 13)
        cleanupOutdatedCaches: true,
        // polices auto-hébergées dans public/fonts (précachées par globPatterns) : plus aucune origine externe
      },
    }),
  ],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: {
    target: 'es2022',
    sourcemap: false,
    minify: 'esbuild',
    // deux pages : le jeu et « À propos » (a-propos/index.html, précachée comme le reste)
    rollupOptions: SINGLE
      ? undefined
      : {
          input: {
            main: fileURLToPath(new URL('./index.html', import.meta.url)),
            about: fileURLToPath(new URL('./a-propos/index.html', import.meta.url)),
          },
        },
  },
  test: {
    include: ['src/**/*.test.ts', 'tools/**/*.test.ts'], // src/meta inclus : la méta est pure (pas de DOM)
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
