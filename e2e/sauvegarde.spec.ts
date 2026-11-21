// 1.69.3 (docs/specs/sauvegarde-sure.md) : une sauvegarde qui ne recule jamais. Un réglage changé juste avant un
// rechargement était parfois perdu : l'écriture IndexedDB, asynchrone, n'avait pas abouti et le chargement la croyait
// avant localStorage. Mesure sur main (aed970f) : un rechargement sur 5 revenait à l'ancienne langue.
import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, openGame } from './helpers';

const TRIES = 10;

/** Le joueur choisit la langue dans les réglages, puis la page se recharge aussitôt, sans rien attendre. */
async function switchAndReload(page: Page, lang: 'fr' | 'en'): Promise<void> {
  await page.locator('#settingsBtn').click();
  await page.locator(`#setLang [data-lang="${lang}"]`).click();
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
}

test('A setting changed just before a reload is kept', async ({ page }) => {
  test.setTimeout(TRIES * 60_000); // deux rechargements par essai ; SwiftShader est lent
  const errors = collectConsoleErrors(page);
  await openGame(page);
  for (let i = 1; i <= TRIES; i++) {
    // le jeu en français
    await switchAndReload(page, 'fr');
    await expect(page.locator('html'), `essai ${i} : français`).toHaveAttribute('lang', 'fr');
    // le joueur passe en anglais, la page se recharge aussitôt
    await switchAndReload(page, 'en');
    expect(await page.evaluate(() => (window as any).__game.meta.settings.lang), `essai ${i}`).toBe('en');
    await expect(page.locator('html'), `essai ${i} : anglais`).toHaveAttribute('lang', 'en');
    await expect(page.locator('#playBtn')).toHaveText('Play');
  }
  expect(errors).toEqual([]);
});
