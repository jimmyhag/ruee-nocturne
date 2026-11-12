import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { parsePatchNotes } from './src/meta/patch-notes.ts';
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

/**
 * Nouveautés (1.49.0) : `virtual:patch-notes` = CHANGELOG.md réduit à ce qui parle aux joueurs (src/meta/patch-notes.ts).
 * Importé dynamiquement par la feuille Nouveautés : un chunk à part, précaché par le service worker, absent du
 * premier chargement. Le journal est la seule source : une version ajoutée au journal apparaît dans le jeu.
 */
function patchNotes(): Plugin {
  const ID = 'virtual:patch-notes';
  const RESOLVED = '\0' + ID;
  const file = fileURLToPath(new URL('./CHANGELOG.md', import.meta.url));
  return {
    name: 'ruee:patch-notes',
    resolveId: (id) => (id === ID ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return undefined;
      this.addWatchFile(file);
      return `export default ${JSON.stringify(parsePatchNotes(readFileSync(file, 'utf8')))};`;
    },
  };
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
    patchNotes(),
    ...(SINGLE ? [viteSingleFile()] : [preloadRenderChunk()]),
    VitePWA({
      disable: SINGLE,
      registerType: 'prompt', // on ne force jamais une mise à jour en pleine partie (skill pwa-release §2)
      injectRegister: null, // enregistrement explicite dans src/platform/pwa.ts
      manifest: {
        id: '/',
        name: 'Swarmageddon',
        short_name: 'Swarmageddon',
        description: 'Survis à la horde : armes automatiques, saut, dash et améliorations.',
        lang: 'fr',
        start_url: '/',
        scope: '/',
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'any',
        background_color: '#0f1628',
        theme_color: '#0f1628',
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
        // phase 20 : les modèles 3D (.glb, hors globPatterns) ne sont pas précachés : chaque joueur ne charge que son
        // héros et les objets, gardés ensuite en cache (jeu hors ligne après la première partie)
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/models/'),
            handler: 'CacheFirst',
            options: { cacheName: 'models', expiration: { maxEntries: 28 } }, // phase 44 : + décor stylisé et six textures de sol
          },
          // phase 36 : la planche de bruitages (chargée entière par fetch) reste en cache : sons enregistrés hors ligne.
          // Les musiques sont lues en flux (requêtes partielles, 206) : non mises en cache, hors ligne le jeu se tait.
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/audio/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio',
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [200] },
              rangeRequests: true,
            },
          },
        ],
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
