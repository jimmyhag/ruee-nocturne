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
  await expect(page.locator('#chars .card.char')).toHaveCount(9);
  await expect(page.locator('#chars .card.char.locked')).toHaveCount(8);

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
  await expect(page.locator('#chars .card.char.locked')).toHaveCount(7); // 9 personnages, 2 débloqués
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

// Porte de phase 6 : un nouveau personnage en moins de 5 runs (achat en or), et l'achat lui-même.
test('personnage acheté en or : la Veilleuse se débloque en moins de 5 runs d’un nouveau joueur', async ({ page }) => {
  await openGame(page);
  const veilleuse = page.locator('#chars .card.char[data-char="veilleuse"]');
  await expect(veilleuse).toHaveClass(/locked/);
  await expect(veilleuse.locator('.buychar')).toHaveClass(/poor/);
  let runs = 0;
  for (; runs < 4; runs++) {
    await startRun(page, 10 + runs);
    await page.evaluate(() => (window as any).__game.debug.god());
    await page.evaluate(() => (window as any).__game.debug.warp(240)); // 4 min par run, sans aucun talent de joueur
    for (let i = 0; i < 12; i++) {
      // le saut dans le temps laisse des montées de niveau en attente : on prend la carte 1
      if ((await page.evaluate(() => (window as any).__game.app)) !== 'levelup') break;
      await page.keyboard.press('Digit1');
      await page.waitForTimeout(250);
    }
    await page.evaluate(() => (window as any).__game.debug.kill());
    await expect(page.locator('#over')).toBeVisible({ timeout: 5000 });
    await page.locator('#menuBtn').click();
    const gold = await page.evaluate(() => (window as any).__game.meta.gold as number);
    if (gold >= 800) break;
  }
  expect(runs + 1, 'runs nécessaires').toBeLessThan(5);
  await expect(veilleuse.locator('.buychar')).not.toHaveClass(/poor/);
  await veilleuse.locator('.buychar').click();
  await expect(veilleuse).not.toHaveClass(/locked/);
  await expect(veilleuse).toHaveClass(/selected/);
  await expect(page.locator('#charInfo')).toContainText('Braise');
  await startRun(page, 5);
  const w = await page.evaluate(() => Object.keys((window as any).__game.world.weapons));
  expect(w).toEqual(['aura']);
});
