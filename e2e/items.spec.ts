// Phase 17 : coffre → objet passif, marchand (clavier et tactile), migration de la boutique (or rendu).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openGame, startRun } from './helpers';

/** Choisit, au clavier (PC) ou au doigt (mobile), la i-ème carte d'un conteneur de cartes. */
async function pickCard(page: Page, sel: string, i: number, touch: boolean): Promise<void> {
  const card = page.locator(`${sel} .card`).nth(i);
  if (touch) await card.tap();
  else await page.keyboard.press(`Digit${i + 1}`);
}

test('coffre : un choix d’objets passifs, l’objet rejoint le HUD', async ({ page, hasTouch }) => {
  await openGame(page);
  await startRun(page, 7);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9; // pas de montée de niveau parasite
    g.debug.chest();
  });
  await page.waitForSelector('#levelup:not([hidden])');
  await expect(page.locator('#luTitle')).toHaveText('Coffre');
  await expect(page.locator('#cards .card')).toHaveCount(3);
  await expect(page.locator('#cards .badge.item').first()).toBeVisible();
  const key = await page.evaluate(() => (window as any).__game.world.cards[0].key as string);
  await pickCard(page, '#cards', 0, hasTouch);
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const items = await page.evaluate(() => [...(window as any).__game.world.itemOrder] as number[]);
  expect(items.length).toBe(1);
  await expect(page.locator('#kit .item')).toHaveCount(1);
  expect(key.length).toBeGreaterThan(2);
});

test('marchand : on entre, on achète avec l’or de la partie, on relance, on part', async ({ page, hasTouch }) => {
  await openGame(page);
  await startRun(page, 8);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    g.world.gold = 1000;
    g.debug.merchant(6);
  });
  await expect(page.locator('#merchantChip')).toBeVisible();
  // on marche jusqu'à l'échoppe (elle est devant, vers −z) : on y téléporte le joueur pour ne pas dépendre du terrain
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.teleport(g.world.merchant.x, g.world.merchant.z);
  });
  await page.waitForSelector('#merchant:not([hidden])');
  await expect(page.locator('#mcards .card')).toHaveCount(3);
  await expect(page.locator('#mcards .badge.price').first()).toBeVisible();
  const t0 = await page.evaluate(() => (window as any).__game.world.t as number);
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => (window as any).__game.world.t as number)).toBe(t0); // pause pendant l'échoppe
  const price = await page.evaluate(() => (window as any).__game.world.offers[0].s0 as number);
  await pickCard(page, '#mcards', 0, hasTouch);
  await expect(page.locator('#mcards .card').first()).toHaveClass(/off/);
  await expect(page.locator('#mGold')).toHaveText(`${1000 - price} or`);
  // relance : R au clavier, le bouton au doigt
  if (hasTouch) await page.locator('#mReroll').tap();
  else await page.keyboard.press('KeyR');
  await page.waitForFunction(() => (window as any).__game.world.merchant.rerolls === 1);
  await expect(page.locator('#mcards .card.off')).toHaveCount(0);
  // départ : Échap au clavier, « Partir » au doigt
  if (hasTouch) await page.locator('#mLeave').tap();
  else await page.keyboard.press('Escape');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const w = await page.evaluate(() => {
    const g = (window as any).__game.world;
    return { items: g.itemOrder.length, spent: g.goldSpent };
  });
  expect(w.items).toBe(1);
  expect(w.spent).toBe(price);
  await expect(page.locator('#kit .item')).toHaveCount(1);
});

test('migration : une sauvegarde avec des paliers de boutique récupère son or, une seule fois', async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, 'méta : un seul projet suffit');
  await openGame(page);
  // 1 palier de Vitalité chez l'Éclaireuse (200) et 2 de Dégâts chez le Bûcheron (200 + 260)
  await page.evaluate(() =>
    (window as any).__game.setMeta({ version: 3, gold: 40, shops: { eclaireuse: [1], bucheron: [0, 2] } }),
  );
  let meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.version).toBe(4);
  expect(meta.gold).toBe(40 + 200 + 200 + 260);
  expect(meta.shops).toBeUndefined();
  await page.locator('#shopBtn').click();
  await expect(page.locator('#shop')).toBeVisible();
  await expect(page.locator('#shopGold')).toHaveText('700 or');
  await page.locator('#shopBackBtn').click();
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.gold).toBe(700); // relue : rien de plus
});
