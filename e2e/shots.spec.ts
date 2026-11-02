// Captures d'écran pour vérification visuelle (à lire avec l'outil Read, jamais à « supposer »).
// Sortie : shots/<projet>-<écran>.png
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openGame, startRun } from './helpers';

const shot = (name: string, project: string) => ({
  path: `shots/${project}-${name}.png`,
  animations: 'disabled' as const,
});

/** Attend qu'un kill survienne, laisse courir `afterMs` de jeu puis fige la boucle (particules en vol). */
async function freezeAfterKill(page: Page, afterMs: number): Promise<void> {
  await page.evaluate(
    (ms) =>
      new Promise<void>((resolve, reject) => {
        const g = (window as any).__game;
        const k0 = g.world.kills as number;
        const t0 = performance.now();
        let tKill = 0;
        const check = () => {
          if (g.app !== 'play') return reject(new Error('partie interrompue : ' + g.app));
          if (performance.now() - t0 > 8000) return reject(new Error('aucun kill en 8 s'));
          if (!tKill && g.world.kills > k0) tKill = performance.now();
          if (tKill && performance.now() - tKill >= ms) {
            g.debug.speed(0);
            return resolve();
          }
          requestAnimationFrame(check);
        };
        check();
      }),
    afterMs,
  );
}

test('menu, jeu à 3 min, montée de niveau, mort', async ({ page }, info) => {
  const p = info.project.name;
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true)); // pas d'onglet perf sur les captures
  await page.waitForTimeout(800); // polices
  await page.screenshot(shot('menu', p));

  await startRun(page, 42);
  await page.evaluate(() => (window as any).__game.debug.warp(180));
  await page.evaluate(() => (window as any).__game.debug.god()); // à 3:00 encerclé, le joueur mourrait avant la capture
  await page.waitForTimeout(600); // quelques frames de rendu après le saut dans la sim
  const app = await page.evaluate(() => (window as any).__game.app as string);
  if (app === 'levelup') {
    // le warp a pu laisser une montée de niveau en attente : on la prend
    await page.locator('.card').first().click();
    await page.waitForTimeout(500);
  }
  await page.screenshot(shot('jeu-3min', p));

  await page.evaluate(() => (window as any).__game.debug.levelUp());
  await expect(page.locator('#levelup')).toBeVisible();
  await page.waitForTimeout(400); // animation des cartes
  await page.screenshot(shot('levelup', p));
  await page.locator('.card').first().click();

  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#over')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot(shot('mort', p));
});

// Porte de phase 2 : kill d'élite (particules, chiffres), montée de niveau (anneau), boss (bannière, barre, recul caméra).
test('game feel : kill d’élite, montée de niveau, boss', async ({ page }, info) => {
  const p = info.project.name;
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  await startRun(page, 7);
  await page.evaluate(() => (window as any).__game.debug.god());
  // élite : une Brute à 1 PV posée à 2 u, tuée par la première arme qui la touche
  await page.evaluate(() => (window as any).__game.debug.weak(2, 2));
  await freezeAfterKill(page, 140);
  await page.waitForTimeout(150);
  const parts = await page.evaluate(() => (window as any).__game.scene.particles.alive as number);
  expect(parts, 'particules du kill en vol').toBeGreaterThan(20);
  await page.screenshot(shot('kill-elite', p));

  // montée de niveau : anneau de particules autour du joueur, juste avant l'écran de choix
  await page.evaluate(() => (window as any).__game.debug.speed(1));
  await page.evaluate(() => (window as any).__game.debug.levelUp());
  await expect(page.locator('#levelup')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot(shot('levelup-feel', p));
  await page.keyboard.press('Digit1'); // parité clavier : touche 1 = carte 1
  await page.waitForFunction(() => (window as any).__game.app === 'play', null, { timeout: 3000 });

  // boss : saut à 4:59,5 puis la boucle réelle fait apparaître le Gardien (bannière, son, shake passent par
  // handleEvents, pas par warp) ; ramené à 6 u devant le joueur
  await page.evaluate(() => (window as any).__game.debug.warp(299.5 - (window as any).__game.world.t));
  const appNow = await page.evaluate(() => (window as any).__game.app as string);
  if (appNow === 'levelup') {
    await page.keyboard.press('Digit1');
    await page.waitForFunction(() => (window as any).__game.app === 'play', null, { timeout: 3000 });
  }
  await page.waitForFunction(() => (window as any).__game.world.bossIndex >= 0, null, { timeout: 8000 });
  await page.evaluate(() => (window as any).__game.debug.pullBoss(6));
  await page.waitForTimeout(400);
  await expect(page.locator('#banner')).toHaveClass(/on/);
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(100);
  await expect(page.locator('#bossbar')).toBeVisible();
  await page.screenshot(shot('boss', p));
  await page.evaluate(() => (window as any).__game.debug.speed(1));
});
