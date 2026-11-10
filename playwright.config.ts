// Tests de fumée WebGL et captures (skill sim-testing §5).
// Deux projets : desktop 1280×720 et mobile iPhone 13 tactile, tous deux sur Chromium (SwiftShader en headless).
import { defineConfig, devices } from '@playwright/test';

const PORT = +(process.env.PW_PORT ?? 4173); // PW_PORT : autre port quand un preview tourne déjà (worktrees en parallèle)
const CHROMIUM_ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
// PW_CHROMIUM : binaire Chromium déjà présent (environnement sans `playwright install`) ; vide = celui de Playwright
const LAUNCH = { args: CHROMIUM_ARGS, executablePath: process.env.PW_CHROMIUM || undefined };

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1, // SwiftShader est lent : un seul navigateur à la fois
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'fr-FR', // les specs lisent des libellés français ; e2e/lang.spec.ts teste l'anglais avec son propre profil
    trace: 'retain-on-failure',
    video: 'off',
  },
  webServer: {
    // on teste le build de prod servi par `vite preview` : c'est là que le service worker existe
    command: `npm run build && npm run preview -- --port ${PORT} --strictPort`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 720 },
        launchOptions: LAUNCH,
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium', // le profil iPhone cible WebKit par défaut ; on reste sur Chromium
        hasTouch: true,
        launchOptions: LAUNCH,
      },
    },
  ],
});
