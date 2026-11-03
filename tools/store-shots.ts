// Captures « store » (phase 5) : 1080×1920 (téléphone) et 1920×1080 (PC) dans docs/store/, plus les deux captures du
// manifest PWA (public/screenshots/). Sert le build de prod avec `vite preview` (le service worker n'existe que là),
// pilote le jeu par les hooks de debug (`?debug=1`), Chromium SwiftShader comme les e2e.
//   npm run build && npm run store            # port 4373 par défaut
//   npm run store -- --port 4473 --lang en
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import type { Page } from '@playwright/test';

const arg = (name: string, def: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : def;
};
const PORT = +arg('--port', '4373');
const LANG = arg('--lang', 'fr');
const OUT = 'docs/store';
const URL = `http://localhost:${PORT}/?debug=1`;
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

mkdirSync(OUT, { recursive: true });
const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
process.on('exit', () => server.kill());
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`http://localhost:${PORT}/`)).ok) break;
  } catch {
    /* pas prêt */
  }
  await new Promise((r) => setTimeout(r, 500));
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function open(page: Page): Promise<void> {
  await page.goto(URL);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate((lang) => {
    const game = (window as any).__game;
    game.setMeta({ ...game.meta, settings: { ...game.meta.settings, lang } });
    (document.getElementById('perf') as HTMLElement).hidden = true;
  }, LANG);
  await page.evaluate(() => document.fonts.ready);
}
async function start(page: Page, variant: number): Promise<void> {
  await page.evaluate((v) => (window as any).__game.start(v), variant);
  await page.waitForFunction(() => (window as any).__game.app === 'play');
}
/** Prend la carte 1 tant qu'un choix est affiché, puis attend le jeu. */
async function pickUntilPlay(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    if ((await page.evaluate(() => (window as any).__game.app)) === 'play') return;
    await page.keyboard.press('Digit1');
    await page.waitForTimeout(250);
  }
}
/** Fige la boucle `ms` ms de jeu après le prochain kill (particules en vol). */
async function freezeAfterKill(page: Page, ms: number): Promise<void> {
  await page.evaluate(
    (ms) =>
      new Promise<void>((resolve) => {
        const game = (window as any).__game;
        const k0 = game.world.kills;
        let tKill = 0;
        const t0 = performance.now();
        const check = () => {
          if (!tKill && game.world.kills > k0) tKill = performance.now();
          if ((tKill && performance.now() - tKill >= ms) || performance.now() - t0 > 8000) {
            game.debug.speed(0);
            return resolve();
          }
          requestAnimationFrame(check);
        };
        check();
      }),
    ms,
  );
}

const browser = await chromium.launch({ args: ARGS, executablePath: process.env.PW_CHROMIUM || undefined });
try {
  // ---------- téléphone 1080×1920 (viewport 540×960 à ×2) ----------
  const phone = await browser.newContext({
    viewport: { width: 540, height: 960 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: LANG === 'fr' ? 'fr-FR' : 'en-US',
  });
  const p = await phone.newPage();
  await open(p);
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/phone-1-menu.png` });
  await p.screenshot({ path: `public/screenshots/mobile.png` }); // fiche d'installation (manifest)

  await start(p, 42);
  await p.evaluate(() => (window as any).__game.debug.god());
  await p.evaluate(() => (window as any).__game.debug.warp(170));
  await pickUntilPlay(p);
  await p.evaluate(() => (window as any).__game.debug.weak(2, 2)); // une Brute à 1 PV : gerbe dorée au prochain coup
  await freezeAfterKill(p, 140);
  await p.screenshot({ path: `${OUT}/phone-2-jeu.png` });

  await p.evaluate(() => (window as any).__game.debug.speed(1));
  await p.evaluate(() => (window as any).__game.debug.levelUp());
  await p.waitForSelector('#levelup:not([hidden])');
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/phone-3-niveau.png` });
  await pickUntilPlay(p);

  await p.evaluate(() => (window as any).__game.debug.evolve('orbe'));
  await p.evaluate(() => (window as any).__game.debug.evolve('foudre'));
  await p.evaluate(() => (window as any).__game.debug.warp(60));
  await pickUntilPlay(p);
  await p.evaluate(() => (window as any).__game.debug.spawn(2, 12, 7));
  await freezeAfterKill(p, 120);
  await p.screenshot({ path: `${OUT}/phone-4-evolutions.png` });

  await p.evaluate(() => (window as any).__game.debug.speed(1));
  await p.evaluate(() => (window as any).__game.debug.kill());
  await p.waitForSelector('#over:not([hidden])', { timeout: 5000 });
  await p.waitForTimeout(400);
  await p.screenshot({ path: `${OUT}/phone-5-mort.png` });
  await phone.close();

  // ---------- PC 1920×1080 (viewport 960×540 à ×2) ----------
  const desk = await browser.newContext({
    viewport: { width: 960, height: 540 },
    deviceScaleFactor: 2,
    locale: LANG === 'fr' ? 'fr-FR' : 'en-US',
  });
  const d = await desk.newPage();
  await open(d);
  await d.waitForTimeout(500);
  await d.screenshot({ path: `${OUT}/desktop-1-menu.png` });

  await start(d, 7);
  await d.evaluate(() => (window as any).__game.debug.god());
  await d.evaluate(() => (window as any).__game.debug.warp(299.5));
  await pickUntilPlay(d);
  await d.waitForFunction(() => (window as any).__game.world.bossIndex >= 0, null, { timeout: 8000 });
  await d.evaluate(() => (window as any).__game.debug.pullBoss(6));
  await d.waitForTimeout(400);
  await d.evaluate(() => (window as any).__game.debug.speed(0));
  await d.waitForTimeout(100);
  await d.screenshot({ path: `${OUT}/desktop-2-boss.png` });

  await d.evaluate(() => (window as any).__game.debug.speed(1));
  await d.evaluate(() => (window as any).__game.debug.evolve('aura'));
  await d.evaluate(() => (window as any).__game.debug.evolve('lames'));
  await d.evaluate(() => (window as any).__game.debug.warp(400));
  await pickUntilPlay(d);
  await d.evaluate(() => (window as any).__game.debug.spawn(0, 30, 8));
  await freezeAfterKill(d, 120);
  await d.screenshot({ path: `${OUT}/desktop-3-jeu.png` });
  await d.screenshot({ path: `public/screenshots/desktop.png` }); // fiche d'installation (manifest, 1920×1080)
  await desk.close();
  console.log(`captures écrites dans ${OUT}/ et public/screenshots/ (${LANG})`);
} finally {
  await browser.close();
  server.kill();
}
