// 1.36.1 (demande de Jimmy) : jouer hors ligne, puis la progression repart seule vers le compte au retour du réseau ;
// un envoi raté alors que l'appareil se croit en ligne est réessayé tout seul. Compte factice (aucun appel Firebase).
import { expect, test } from '@playwright/test';
import { openGame } from './helpers';

test('partie jouée hors ligne : « à synchroniser » au menu, puis envoyée au retour du réseau', async ({
  page,
  context,
}) => {
  await openGame(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ version: 5, runs: 1, gold: 10 });
    (window as any).__fake = g.fakeAccount('u-hors-ligne', [], { sync: true });
  });
  // connexion : le nuage est vide, la progression locale part
  await page.waitForFunction(() => (window as any).__fake.saves.length >= 1);
  await expect(page.locator('#accountLabel')).toContainText('test@example.com');

  await context.setOffline(true);
  await page.evaluate(() => (window as any).__game.start(1));
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#over')).toBeVisible({ timeout: 10_000 });
  await page.waitForTimeout(2600); // l'envoi groupé (2 s) tombe hors ligne
  const before = await page.evaluate(() => (window as any).__fake.saves.length);
  const runs = await page.evaluate(() => (window as any).__game.meta.runs);
  expect(runs).toBe(2);
  await page.locator('#menuBtn').click();
  await expect(page.locator('#accountLabel')).toHaveText(/à synchroniser/);

  // retour du réseau : la partie jouée hors ligne part toute seule
  await context.setOffline(false);
  await page.waitForFunction(
    (n) => {
      const s = (window as any).__fake.saves;
      return s.length > n && s[s.length - 1].progress.runs === 2;
    },
    before,
    { timeout: 10_000 },
  );
  await expect(page.locator('#accountLabel')).toContainText('test@example.com');
});

test('envoi raté en ligne (serveur injoignable) : réessayé tout seul', async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ version: 5, runs: 3 });
    (window as any).__fake = g.fakeAccount('u-reessai', [], { sync: true, failWrites: 1 });
  });
  await expect(page.locator('#accountLabel')).toHaveText(/à synchroniser/);
  // premier réessai après 5 s (SYNC.retryMs)
  await page.waitForFunction(() => (window as any).__fake.saves.length === 1, null, { timeout: 12_000 });
  await expect(page.locator('#accountLabel')).toContainText('test@example.com');
});
