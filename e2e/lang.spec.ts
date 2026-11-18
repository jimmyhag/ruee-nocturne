// Localisation (phase 5) : bascule à chaud depuis les réglages, persistance, détection automatique de la langue
// du navigateur, et priorité du réglage sur la détection.
import { expect, test } from '@playwright/test';
import { openCharacters, openGame, startRun } from './helpers';

test('réglages : passer en anglais traduit le menu, les cartes et l’écran de mort ; le choix survit au rechargement', async ({
  page,
}) => {
  await openGame(page);
  await expect(page.locator('#playBtn')).toHaveText('Jouer');
  await page.locator('#settingsBtn').click();
  // interface Nocturne : auto, français, anglais en choix soulignés
  const lang = (v: string) => page.locator(`#setLang [data-lang="${v}"]`);
  await expect(lang('auto')).toHaveAttribute('aria-pressed', 'true');
  await lang('fr').click();
  await expect(lang('fr')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#settings h2')).toHaveText('Réglages');
  await lang('en').click();
  await expect(lang('en')).toHaveAttribute('aria-pressed', 'true');
  await expect(lang('fr')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#settings h2')).toHaveText('Settings');
  await expect(page.locator('#setSoundBtn')).toHaveAttribute('aria-label', 'Sound');
  await expect(page.locator('#setSoundBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await page.locator('#settingsBackBtn').click();
  await expect(page.locator('#playBtn')).toHaveText('Play');
  await expect(page.locator('#menuGold')).toHaveAttribute('aria-label', /^Gold: \d/);
  await expect(page.locator('#shopBtn')).toContainText('Slots');
  await openCharacters(page);
  await expect(page.locator('#chars .char').first()).toContainText('Scout');
  await expect(page.locator('#characters h2')).toHaveText('Heroes');
  await page.locator('#charactersBackBtn').click();

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
    await expect(page.locator('#bestLine')).toHaveText('No record');
  });
  test('un réglage explicite « français » prime sur le navigateur, même via setMeta', async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => (window as any).__game.setMeta({ version: 3, settings: { lang: 'fr' } }));
    await expect(page.locator('#playBtn')).toHaveText('Jouer');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  });
});
