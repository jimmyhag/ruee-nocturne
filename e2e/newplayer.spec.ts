// Porte de phase 4 : un nouveau joueur obtient son premier déblocage en moins de 3 runs ; export/import vérifié.
import { expect, test } from '@playwright/test';
import { openGame, startRun } from './helpers';

/** Profil vierge : on remplace la méta par défaut via le hook de debug (IndexedDB + localStorage). */
async function freshProfile(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(() => (window as any).__game.setMeta({ version: 2 }));
}

test('nouveau joueur : premier déblocage (défi du jour) dès le premier run', async ({ page }) => {
  await openGame(page);
  await freshProfile(page);
  await expect(page.locator('#dailyBtn')).toBeHidden();
  await expect(page.locator('#chars .card.char')).toHaveCount(3);
  await expect(page.locator('#chars .card.char.locked')).toHaveCount(2);

  // run 1 : 3 minutes et quelques, puis la mort
  await startRun(page, 5);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.warp(185);
    g.debug.kill();
  });
  await expect(page.locator('#over')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#oUnlocked')).toBeVisible();
  await expect(page.locator('#oUnlocked')).toContainText('Première nuit');
  await expect(page.locator('#oProgress .ach')).toHaveCount(3); // les 3 succès les plus proches, avec barres
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.runs).toBe(1);
  expect(meta.achievements).toContain('survie3');
  expect(meta.gold).toBeGreaterThan(0);

  // retour au menu : le défi du jour est disponible, l'or s'affiche sur la boutique
  await page.locator('#menuBtn').click();
  await expect(page.locator('#dailyBtn')).toBeVisible();
  await expect(page.locator('#shopBtn')).toContainText('or');
});

test('boutique : acheter un palier débite l’or et le run suivant en bénéficie', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 2, gold: 100 }));
  await page.locator('#shopBtn').click();
  await expect(page.locator('#shop')).toBeVisible();
  await expect(page.locator('#shopGold')).toHaveText('100 or');
  const firstBuy = page.locator('#shopLines .buy').first(); // Vitalité, 40 or
  await firstBuy.click();
  await expect(page.locator('#shopGold')).toHaveText('60 or');
  await page.locator('#shopBackBtn').click();
  await startRun(page, 3);
  const maxHp = await page.evaluate(() => (window as any).__game.world.player.maxHp as number);
  expect(maxHp).toBe(110);
});

test('réglages : export puis import restaurent record, or et succès ; le JSON étranger est refusé', async ({
  page,
}) => {
  await openGame(page);
  await page.evaluate(() =>
    (window as any).__game.setMeta({ version: 2, bestTime: 456, gold: 321, runs: 9, achievements: ['survie3'] }),
  );
  await page.locator('#settingsBtn').click();
  await expect(page.locator('#settings')).toBeVisible();
  // export : la zone de texte reçoit le JSON (le téléchargement n'est pas attendu sous Playwright)
  const downloadP = page.waitForEvent('download', { timeout: 3000 }).catch(() => null);
  await page.locator('#exportBtn').click();
  await downloadP;
  const json = await page.locator('#saveText').inputValue();
  expect(json).toContain('"app": "ruee-nocturne"');
  // remise à zéro (deux appuis), puis import du texte
  await page.locator('#resetBtn').click();
  await page.locator('#resetBtn').click();
  expect(await page.evaluate(() => (window as any).__game.meta.gold)).toBe(0);
  await page.locator('#saveText').fill(json);
  await page.locator('#importBtn').click();
  await expect(page.locator('#settingsMsg')).toContainText('importée');
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.bestTime).toBe(456);
  expect(meta.gold).toBe(321);
  expect(meta.runs).toBe(9);
  expect(meta.achievements).toEqual(['survie3']);
  // JSON étranger
  await page.locator('#saveText').fill('{"hello":"world"}');
  await page.locator('#importBtn').click();
  await expect(page.locator('#settingsMsg')).toContainText("n'est pas une sauvegarde");
  // la sauvegarde survit au rechargement
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  expect(await page.evaluate(() => (window as any).__game.meta.gold)).toBe(321);
});

test('personnage : le Bûcheron débloqué devient sélectionnable et démarre avec les Lames', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 2, achievements: ['survie3', 'survie10'] }));
  await expect(page.locator('#chars .card.char.locked')).toHaveCount(1);
  await page.locator('#chars .card.char[data-char="bucheron"]').click();
  await expect(page.locator('#chars .card.char[data-char="bucheron"]')).toHaveClass(/selected/);
  await startRun(page, 4);
  const w = await page.evaluate(() => {
    const g = (window as any).__game;
    return { weapons: Object.keys(g.world.weapons), hp: g.world.player.maxHp as number };
  });
  expect(w.weapons).toEqual(['lames']);
  expect(w.hp).toBe(130);
});
