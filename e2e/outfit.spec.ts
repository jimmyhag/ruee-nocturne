// Tenues (phase 7) : achat en or sous la grille des personnages, bascule, persistance après rechargement.
import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

test('tenue alternative : achat à 400 or, aperçu changé, choix conservé après rechargement', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 2, gold: 450 }));
  const alt = page.locator('#charInfo [data-outfit="1"]');
  const classic = page.locator('#charInfo [data-outfit="0"]');
  await expect(classic).toHaveAttribute('aria-pressed', 'true');
  await expect(alt).toContainText('400');
  await alt.click();
  await expect(alt).toHaveAttribute('aria-pressed', 'true');
  await expect(alt).not.toContainText('400');
  let meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.gold).toBe(50);
  expect(meta.outfits).toEqual(['eclaireuse']);
  expect(await page.evaluate(() => (window as any).__game.scene.modelSkin)).toBe(1);
  // bascule gratuite
  await classic.click();
  await expect(classic).toHaveAttribute('aria-pressed', 'true');
  meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.gold).toBe(50);
  await alt.click();
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await expect(page.locator('#charInfo [data-outfit="1"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (window as any).__game.scene.modelSkin)).toBe(1);
  // sans or, l'achat d'une autre tenue est refusé
  await page.evaluate(() => (window as any).__game.setMeta({ version: 2, gold: 10, character: 'eclaireuse' }));
  await page.locator('#charInfo [data-outfit="1"]').click();
  meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.outfits).toEqual([]);
  expect(meta.gold).toBe(10);
});
