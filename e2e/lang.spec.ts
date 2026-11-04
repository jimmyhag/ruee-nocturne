// Localisation (phase 5) : bascule à chaud depuis les réglages, persistance, détection automatique de la langue
// du navigateur, et priorité du réglage sur la détection.
import { expect, test } from '@playwright/test';
import { openGame, startRun } from './helpers';

test('réglages : passer en anglais traduit le menu, les cartes et l’écran de mort ; le choix survit au rechargement', async ({
  page,
}) => {
  await openGame(page);
  await expect(page.locator('#playBtn')).toHaveText('Jouer');
  await page.locator('#settingsBtn').click();
  // auto → fr → en
  await page.locator('#setLangBtn').click();
  await expect(page.locator('#setLangBtn')).toHaveText('Langue : français');
  await page.locator('#setLangBtn').click();
  await expect(page.locator('#setLangBtn')).toHaveText('Language: English');
  await expect(page.locator('#settings h2')).toHaveText('Settings');
  await expect(page.locator('#setSoundBtn')).toHaveText('Sound: on');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('#settingsBackBtn').click();
  await expect(page.locator('#playBtn')).toHaveText('Play');
  await expect(page.locator('#shopBtn')).toContainText('gold');
  await expect(page.locator('#chars .card.char').first()).toContainText('Scout');

  // en jeu : montée de niveau puis mort, tout en anglais
  await startRun(page, 42);
  await page.evaluate(() => (window as any).__game.debug.levelUp());
  await expect(page.locator('#levelup')).toBeVisible();
  await expect(page.locator('#luTitle')).toHaveText(/Level \d+/);
  await expect(page.locator('#cards .card').first().locator('.badge')).toHaveText(/New weapon|New tome|Lv \d|Bonus/);
  await page.keyboard.press('Digit1');
  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#over')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('#oTitle')).toHaveText('The horde got you');
  await expect(page.locator('#oMsg')).toContainText('gold');

  // persistance : la langue est dans la sauvegarde
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await expect(page.locator('#playBtn')).toHaveText('Play');
});

test.describe('navigateur en anglais', () => {
  test.use({ locale: 'en-US' });
  test('réglage « auto » : l’interface suit le navigateur', async ({ page }) => {
    await openGame(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#playBtn')).toHaveText('Play');
    await expect(page.locator('#bestLine')).toHaveText('No record yet');
  });
  test('un réglage explicite « français » prime sur le navigateur, même via setMeta', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => (window as any).__game.setMeta({ version: 3, settings: { lang: 'fr' } }));
    await expect(page.locator('#playBtn')).toHaveText('Jouer');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
});
