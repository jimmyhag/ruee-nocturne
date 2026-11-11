// Phase 40 : Bibliothèque. Onglets (touches 1 à 4 ou doigt), achat d'un objet débloqué par son succès, retrait d'un
// objet du tirage, et effet réel sur la partie (w.itemBan) ; le défi du jour garde tout.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame } from './helpers';

const ITEM = (page: Page, key: string) =>
  page.evaluate((k) => {
    const g = (window as any).__game;
    return g.world.itemBan[g.itemKeys.indexOf(k)] as number;
  }, key);

test('Bibliothèque : onglets, achat du Phénix, retrait du tirage, effet sur la partie', async ({
  page,
  hasTouch,
}, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  // nouveau joueur (v5) qui a obtenu « Tueur de géants » et 5 000 or
  await page.evaluate(() =>
    (window as any).__game.setMeta({
      version: 5,
      runs: 4,
      gold: 5000,
      achievements: ['boss5'],
      stats: { bosses: 5, kills: 900 },
      codex: { 'w:orbe': 3, 'i:lanterne': 2 },
    }),
  );
  await page.locator('#libBtn').click();
  await expect(page.locator('#library')).toBeVisible();
  await expect(page.locator('#libGold')).toHaveText(/5\D?000 or/);
  await expect(page.locator('#libTabs [data-tab="w"]')).toHaveClass(/selected/);
  await expect(page.locator('#libList .lib')).toHaveCount(13); // phase 47 C : quatre armes de plus
  await expect(page.locator('#libList .lib.locked')).toHaveCount(9); // les armes à succès
  await page.waitForTimeout(200);
  await page.screenshot({ path: `shots/${info.project.name}-bibliotheque-armes.png` });

  // onglet Objets : touche 2 au clavier, doigt sinon
  if (hasTouch) await page.locator('#libTabs [data-tab="i"]').tap();
  else await page.keyboard.press('Digit2');
  await expect(page.locator('#libTabs [data-tab="i"]')).toHaveClass(/selected/);
  await expect(page.locator('#libList .lib')).toHaveCount(48); // phase 47 B : seize objets de plus
  await expect(page.locator('#libList .lib.locked')).toHaveCount(21); // 22 verrouillés, le Phénix est à acheter
  await expect(page.locator('#libList .note')).toContainText('26 objets');
  const buy = page.locator('#libList [data-unlock="i:phenix"]');
  await expect(buy).toBeEnabled();
  await page.screenshot({ path: `shots/${info.project.name}-bibliotheque-objets.png` });
  await buy.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `shots/${info.project.name}-bibliotheque-a-debloquer.png` });
  if (hasTouch) await buy.tap();
  else {
    await buy.focus();
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#libGold')).toHaveText(/1\D?000 or/);
  await expect(page.locator('#libList [data-toggle="phenix"]')).toBeVisible();
  // un commun reste toujours dans le tirage ; retirer la Cape (rare)
  await expect(page.locator('#libList [data-toggle="lanterne"]')).toHaveCount(0);
  const tog = page.locator('#libList [data-toggle="cape"]');
  if (hasTouch) await tog.tap();
  else {
    await tog.focus();
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#libList [data-toggle="cape"]')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#libList .note')).toContainText('26 objets'); // +Phénix −Cape
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.unlocks).toContain('i:phenix');
  expect(meta.itemsOff).toEqual(['cape']);

  // Échap ferme au clavier ; le bouton × au doigt
  if (hasTouch) await page.locator('#libBackBtn').tap();
  else await page.keyboard.press('Escape');
  await expect(page.locator('#library')).toBeHidden();

  // la partie : Cape et objets verrouillés hors tirage, Phénix et Lanterne dedans
  await page.evaluate(() => (window as any).__game.start(1));
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  expect(await ITEM(page, 'cape')).toBe(1);
  expect(await ITEM(page, 'lanterne')).toBe(0);
  expect(await ITEM(page, 'couronne')).toBe(1);
  expect(await ITEM(page, 'phenix')).toBe(0);
  expect(errors).toEqual([]);
});

test('défi du jour : aucun objet hors tirage', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.evaluate(() =>
    (window as any).__game.setMeta({
      version: 5,
      runs: 2,
      achievements: ['survie3'],
      stats: { bestTime: 200 },
      itemsOff: ['cape'],
    }),
  );
  await page.locator('#dailyBtn').click();
  await page.locator('#dailyPlayBtn').click(); // 1.48.1 : le bouton ouvre la feuille du défi, qui lance la partie
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const banned = await page.evaluate(() => Array.from((window as any).__game.world.itemBan as Uint8Array));
  expect(banned.every((b) => b === 0)).toBe(true);
  expect(errors).toEqual([]);
});
