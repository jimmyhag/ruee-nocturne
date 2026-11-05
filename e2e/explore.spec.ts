// Phase 18 : relief, coffres de carte payants et sanctuaires, au clavier (PC) et au doigt (iPhone), avec captures.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openGame, startRun } from './helpers';

const shot = (name: string, project: string) => ({
  path: `shots/${project}-${name}.png`,
  animations: 'disabled' as const,
});

async function pickCard(page: Page, i: number, touch: boolean): Promise<void> {
  if (touch) await page.locator('#cards .card').nth(i).tap();
  else await page.keyboard.press(`Digit${i + 1}`);
}
/** Partie calme : invincible, pas de montée de niveau ni d'ennemis qui gênent la capture. */
async function calmRun(page: Page, seed: number): Promise<void> {
  await openGame(page);
  await startRun(page, seed);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
  });
}

test('relief : collines visibles, colonnes de lumière au loin, coffre de carte et sanctuaire', async ({
  page,
}, info) => {
  const p = info.project.name;
  await calmRun(page, 18);
  // vue sur un flanc de colline, coffre de carte à quelques mètres (colonne de lumière, puce de prix)
  await page.evaluate(() => {
    const g = (window as any).__game;
    const w = g.world;
    let best = w.mapChests[0];
    for (const c of w.mapChests) if (w.heightAt(c.x, c.z) > w.heightAt(best.x, best.z)) best = c;
    w.gold = 15;
    g.debug.teleport(best.x, best.z + 3.5);
    w.enemyCount = 0;
  });
  await page.waitForTimeout(900);
  await expect(page.locator('#poiChip')).toBeVisible();
  await expect(page.locator('#poiText')).toContainText('pas assez');
  await page.screenshot(shot('relief-coffre', p));
  // sanctuaire le plus haut, de près
  await page.evaluate(() => {
    const g = (window as any).__game;
    const w = g.world;
    let best = w.shrines[0];
    for (const s of w.shrines) if (w.heightAt(s.x, s.z) > w.heightAt(best.x, best.z)) best = s;
    g.debug.teleport(best.x + 1, best.z + 4.5);
    w.enemyCount = 0;
  });
  await page.waitForTimeout(900);
  await page.screenshot(shot('relief-sanctuaire', p));
  // flanc de colline le plus raide de la carte (hors lieux construits) : la pente doit se lire
  await page.evaluate(() => {
    const g = (window as any).__game;
    const w = g.world;
    let bx = 0,
      bz = 0,
      bs = 0;
    for (let x = -150; x <= 150; x += 3)
      for (let z = -150; z <= 150; z += 3) {
        if (w.nearObstacle(x, z) || w.lakes.some((l: any) => Math.hypot(x - l.x, z - l.z) < l.r + 25)) continue;
        const s = Math.hypot(w.heightAt(x + 1, z) - w.heightAt(x - 1, z), w.heightAt(x, z + 1) - w.heightAt(x, z - 1));
        if (s > bs) {
          bs = s;
          bx = x;
          bz = z;
        }
      }
    g.debug.teleport(bx, bz);
    w.enemyCount = 0;
  });
  await page.waitForTimeout(900);
  await page.screenshot(shot('relief-colline', p));
});

test('coffre de carte : on reste dessus, on paie avec l’or de la partie, on choisit un objet', async ({
  page,
  hasTouch,
}) => {
  await calmRun(page, 19);
  const before = await page.evaluate(() => {
    const g = (window as any).__game;
    const w = g.world;
    w.gold = 500;
    const c = w.mapChests[0];
    g.debug.teleport(c.x, c.z);
    return { gold: w.gold, price: 40 };
  });
  await expect(page.locator('#poiChip')).toBeVisible();
  await page.waitForSelector('#levelup:not([hidden])', { timeout: 15000 });
  await expect(page.locator('#luTitle')).toHaveText('Coffre');
  const w1 = await page.evaluate(() => {
    const w = (window as any).__game.world;
    return { gold: w.gold, opened: w.mapChestsOpened, spent: w.goldSpent };
  });
  expect(w1.opened).toBe(1);
  expect(w1.spent).toBe(before.price);
  expect(w1.gold).toBeLessThanOrEqual(before.gold - before.price + 5); // + l'or d'un éventuel kill
  await pickCard(page, 0, hasTouch);
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  expect(await page.evaluate(() => (window as any).__game.world.itemOrder.length)).toBe(1);
});

test('sanctuaire : rester dans le cercle remplit la jauge, puis un bonus pour la partie', async ({
  page,
  hasTouch,
}) => {
  await calmRun(page, 20);
  await page.evaluate(() => {
    const g = (window as any).__game;
    const s = g.world.shrines[0];
    g.debug.teleport(s.x, s.z);
  });
  await expect(page.locator('#poiChip')).toHaveClass(/shrine/);
  await page.waitForSelector('#levelup:not([hidden])', { timeout: 30000 });
  await expect(page.locator('#luTitle')).toHaveText('Sanctuaire');
  await expect(page.locator('#cards .card')).toHaveCount(3);
  await expect(page.locator('#cards .badge.boon').first()).toBeVisible();
  await pickCard(page, 1, hasTouch);
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const boons = await page.evaluate(() =>
    [...(window as any).__game.world.boons].reduce((a: number, b: number) => a + b, 0),
  );
  expect(boons).toBe(1);
  await expect(page.locator('#banner')).toContainText('Sanctuaire');
});
