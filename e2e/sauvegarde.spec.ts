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

test('The revision number does not leave the device', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  // un joueur connecté (compte factice, aucun appel Firebase) : sa progression part vers le compte
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, runs: 1, gold: 10 });
    (window as any).__fake = g.fakeAccount('u-revision', [], { sync: true });
  });
  await page.waitForFunction(() => (window as any).__fake.saves.length >= 1);
  // une sauvegarde de plus (numéro neuf sur l'appareil), puis son envoi groupé
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, gold: 25 });
  });
  await page.waitForFunction(
    () => {
      const s = (window as any).__fake.saves;
      return s.length >= 2 && s[s.length - 1].progress.gold === 25;
    },
    null,
    { timeout: 15_000 },
  );
  // la copie de l'appareil porte bien un numéro…
  const local = await page.evaluate(() => JSON.parse(localStorage.getItem('ruee-meta') ?? '{}').rev);
  expect(local).toBeGreaterThan(0);
  // … et aucun document envoyé ne le contient
  const sent = await page.evaluate(() => (window as any).__fake.saves.map((d: unknown) => JSON.stringify(d)));
  for (const doc of sent) expect(doc).not.toContain('"rev"');
  expect(errors).toEqual([]);
});
