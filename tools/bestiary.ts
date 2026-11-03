// Bestiaire (phase 7) : gros plan de chaque type d'ennemi en jeu, pour valider les silhouettes (à lire avec Read).
//   npm run build && npm run bestiary            # docs/captures/phase-7/ennemi-<clé>.png, port 4534
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { ENEMIES } from '../src/sim/balance';

const PORT = +(process.argv[process.argv.indexOf('--port') + 1] || 4534);
const OUT = 'docs/captures/phase-7';
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
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  executablePath: process.env.PW_CHROMIUM || undefined,
});
try {
  const page = await browser.newPage({ viewport: { width: 640, height: 640 }, deviceScaleFactor: 1, locale: 'fr-FR' });
  await page.goto(`http://localhost:${PORT}/?debug=1&stress=0`);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  for (let t = 0; t < ENEMIES.length; t++) {
    const def = ENEMIES[t];
    await page.evaluate(() => (window as any).__game.start(1));
    await page.waitForFunction(() => (window as any).__game.app === 'play');
    await page.evaluate(
      ([type, r, y]) => {
        const g = (window as any).__game;
        g.debug.god();
        g.debug.stress(0);
        g.debug.spawn(type, 1, 6);
        g.debug.speed(1);
        setTimeout(() => {
          g.debug.speed(0);
          const p = g.world.player;
          // l'ennemi est à 6 u devant (+z) et regarde le joueur : caméra de face, trois quarts, à sa hauteur
          const d = 2.5 + Math.max(r, y) * 2.4;
          g.scene.camPos.set(p.x + d * 0.7, y + 0.6 + r * 0.9, p.z + 6 - d * 0.95);
          g.scene.camLook.set(p.x, y * 0.9, p.z + 6);
          document.getElementById('hud')!.hidden = true;
          document.getElementById('keys')!.hidden = true;
          document.getElementById('perf')!.hidden = true;
        }, 120);
      },
      [t, def.r, def.y] as const,
    );
    await page.waitForTimeout(450);
    await page.screenshot({ path: `${OUT}/ennemi-${def.key}.png` });
    await page.evaluate(() => {
      (window as any).__game.debug.speed(1);
      document.getElementById('hud')!.hidden = false;
    });
    await page.locator('#pauseBtn').click();
    await page.locator('#quitBtn').click();
    await page.waitForFunction(() => (window as any).__game.app === 'menu');
    console.log(`${OUT}/ennemi-${def.key}.png`);
  }
} finally {
  await browser.close();
  server.kill();
}
