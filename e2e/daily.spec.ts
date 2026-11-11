// 1.48.1 (retours de Jimmy) : le défi du jour s'explique avant de se lancer ; une Plume de phénix consommée quitte la
// barre d'équipement.
import { expect, test } from '@playwright/test';
import { appMode, collectConsoleErrors, openGame, startRun } from './helpers';

test('défi du jour : la feuille explique, liste les temps du jour et lance la partie', async ({
  page,
  hasTouch,
}, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  const today = new Date().toISOString().slice(0, 10);
  await page.evaluate(
    (date) =>
      (window as any).__game.setMeta({
        version: 5,
        runs: 2,
        character: 'bucheron',
        bought: ['bucheron'],
        achievements: ['survie3'],
        stats: { bestTime: 200 },
        daily: { date, times: [431, 95] },
      }),
    today,
  );
  await expect(page.locator('#dailyBtn')).toContainText('7:11'); // meilleur temps du jour sur le bouton
  await page.locator('#dailyBtn').click();
  expect(await appMode(page)).toBe('daily'); // plus de lancement direct
  const sheet = page.locator('#daily');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('dd')).toHaveCount(4);
  await expect(sheet).toContainText('Éclaireuse');
  await expect(page.locator('#dailyTimes')).toHaveText('Tes temps du jour : 1er 7:11 · 2e 1:35');
  await expect(page.locator('#dailyNext')).toHaveText(/^Nouveau défi dans (\d+ h \d\d|\d+ min)$/);
  // la feuille tient dans l'écran, bouton compris
  const vp = page.viewportSize()!;
  const btn = (await page.locator('#dailyPlayBtn').boundingBox())!;
  expect(btn.y + btn.height).toBeLessThanOrEqual(vp.height);
  await page.screenshot({ path: `shots/${info.project.name}-defi-du-jour.png` });
  // fermer puis rouvrir : Échap au clavier, la croix au doigt
  if (hasTouch) await page.locator('#dailyBackBtn').tap();
  else await page.keyboard.press('Escape');
  expect(await appMode(page)).toBe('menu');
  await page.locator('#dailyBtn').click();
  // lancer : Entrée au clavier (le bouton a le focus), un appui au doigt
  if (hasTouch) await page.locator('#dailyPlayBtn').tap();
  else await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  // le défi se joue avec l'Éclaireuse, quel que soit le personnage choisi
  expect(await page.evaluate(() => Object.keys((window as any).__game.world.weapons))).toEqual(['orbe']);
  expect(errors).toEqual([]);
});

test('une Plume de phénix consommée quitte la barre d’équipement', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    for (let i = 0; i < g.world.enemies.length; i++) g.world.enemies[i].alive = false;
    g.world.enemyCount = 0;
    for (const k of ['pierre', 'phenix', 'phenix']) g.debug.item(k);
  });
  const feather = page.locator('#gear .git[aria-label*="phénix"]');
  await expect(feather).toHaveCount(1);
  await expect(feather.locator('b')).toHaveText('×2');
  const die = (): Promise<void> =>
    page.evaluate(() => {
      const P = (window as any).__game.world.player;
      P.invul = 0;
      P.hp = 0;
    });
  await die();
  await expect(feather.locator('b')).toHaveText('×1'); // une réanimation : il en reste une
  await page.locator('#gear').screenshot({ path: `shots/${info.project.name}-plume-restante.png` });
  await expect(page.locator('#gear .git')).toHaveCount(2);
  await die();
  await expect(feather).toHaveCount(0); // la dernière est partie, la Pierre à aiguiser reste
  await expect(page.locator('#gear .git')).toHaveCount(1);
  expect(await appMode(page)).toBe('play');
  expect(errors).toEqual([]);
});
