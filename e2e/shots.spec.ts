// Captures d'écran pour vérification visuelle (à lire avec l'outil Read, jamais à « supposer »).
// Sortie : shots/<projet>-<écran>.png
import { expect, test } from '@playwright/test';
import { openGame, startRun } from './helpers';

const shot = (name: string, project: string) => ({
  path: `shots/${project}-${name}.png`,
  animations: 'disabled' as const,
});

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
    await page.waitForTimeout(300);
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
