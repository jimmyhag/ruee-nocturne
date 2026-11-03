// Portraits des personnages (phase 7) : gros plan de chaque modèle en jeu, pour valider le look (à lire avec Read).
// Sert le build de prod, démarre une partie par personnage, fige la boucle et rapproche la caméra via les hooks de debug.
//   npm run build && npm run portraits            # docs/captures/phase-7/portrait-<clé>.png, port 4533
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { CHARACTERS } from '../src/sim/balance';

const PORT = +(process.argv[process.argv.indexOf('--port') + 1] || 4533);
const OUTFIT = process.argv.includes('--outfit') ? 1 : 0; // --outfit : tenue alternative (portrait-<clé>-2.png)
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
  await page.goto(`http://localhost:${PORT}/?debug=1`);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  for (const c of CHARACTERS) {
    await page.evaluate(
      ([key, outfit]) => {
        const g = (window as any).__game;
        g.setMeta({
          ...g.meta,
          character: key,
          achievements: ['survie10', 'kills500', 'boss1', 'win', 'intouchable'],
          bought: ['veilleuse', 'braconnier', 'colporteur'],
          outfits: outfit ? [key] : [],
          outfit: outfit ? { [key]: 1 } : {},
        });
        g.start(1);
      },
      [c.key, OUTFIT] as const,
    );
    await page.waitForFunction(() => (window as any).__game.app === 'play');
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.debug.god();
      // quelques pas pour poser la course, puis gel
      g.debug.speed(1);
    });
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(380);
    await page.keyboard.up('KeyD');
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.debug.speed(0);
      const p = g.world.player;
      // caméra de portrait : de face, trois quarts, à hauteur du buste
      g.scene.camPos.set(p.x + 2.6, 2.2, p.z + 3.4);
      g.scene.camLook.set(p.x, 1.05, p.z);
      document.getElementById('hud')!.hidden = true;
      document.getElementById('keys')!.hidden = true;
      document.getElementById('perf')!.hidden = true;
    });
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}/portrait-${c.key}${OUTFIT ? '-2' : ''}.png` });
    await page.evaluate(() => {
      (window as any).__game.debug.speed(1);
      document.getElementById('hud')!.hidden = false;
    });
    await page.locator('#pauseBtn').click();
    await page.locator('#quitBtn').click();
    await page.waitForFunction(() => (window as any).__game.app === 'menu');
    console.log(`${OUT}/portrait-${c.key}${OUTFIT ? '-2' : ''}.png`);
  }
} finally {
  await browser.close();
  server.kill();
}
