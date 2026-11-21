// L'accueil s'affiche sans attendre, dans toutes les langues (docs/specs/accueil-rapide.md, scénarios 1 et 2).
// Le script principal est retenu (jamais servi) : ce qui s'affiche vient d'index.html et du script précoce seuls.
// Un observateur posé avant le chargement relève, au moment où l'accueil devient visible (`lang-pending` levée, ou
// jamais posée), le texte du bouton Jouer : rien n'a pu être affiché en français puis remplacé.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ locale: 'en-US' });

/** Retient le script principal et note l'état de l'accueil quand il devient visible. */
async function loadWithoutMain(page: Page, savedLang?: 'fr' | 'en'): Promise<void> {
  await page.route(/\/assets\/main-[^/]+\.js$/, () => {}); // jamais servi
  await page.addInitScript((lang) => {
    // aide déjà vue : depuis docs/specs/demarrage-rapide.md, le premier écran d'un profil vierge est l'aide (testée par
    // e2e/demarrage-rapide.spec.ts) ; l'accueil est celui de tous les lancements suivants
    localStorage.setItem(
      'ruee-meta',
      JSON.stringify({ version: 5, seenHelp: true, ...(lang ? { settings: { lang } } : {}) }),
    );
    const w = window as unknown as { __shown?: { play: string; lang: string; pendingSeen: boolean } };
    let pendingSeen = false;
    const note = () => {
      const h = document.documentElement; // absent quand le script de test démarre
      if (w.__shown || !h) return;
      if (h.classList.contains('lang-pending')) {
        pendingSeen = true;
        return;
      }
      const text = document.getElementById('playBtn')?.textContent?.trim(); // le bouton lu en entier par l'analyseur
      if (text) w.__shown = { play: text, lang: h.lang, pendingSeen };
    };
    new MutationObserver(note).observe(document, { attributes: true, childList: true, subtree: true });
  }, savedLang);
  await page.goto('/', { waitUntil: 'commit' });
}

const shown = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __shown?: { play: string; lang: string; pendingSeen: boolean } }).__shown,
  );

test('An English browser sees the home screen translated from the first paint', async ({ page }) => {
  await loadWithoutMain(page);
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#playBtn')).toHaveText('Play');
  await expect(page.locator('#heroName')).toHaveText('Scout'); // nom par défaut, avant que le code le remplisse
  await expect(page.locator('#tabBar')).toBeVisible();
  await expect(page.locator('#shopBtn')).toContainText('Slots');
  await expect(page.locator('#settingsBtn')).toHaveAttribute('aria-label', 'Settings');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  // visible avant la fin du script principal (il n'est jamais arrivé), et déjà en anglais à ce moment
  expect(await page.evaluate(() => '__game' in window)).toBe(false);
  expect(await shown(page)).toEqual({ play: 'Play', lang: 'en', pendingSeen: true });
});

test("The player's language choice wins over the browser", async ({ page }) => {
  await loadWithoutMain(page, 'fr');
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#playBtn')).toHaveText('Jouer');
  await expect(page.locator('#shopBtn')).toContainText('Emplacements');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  expect(await page.evaluate(() => '__game' in window)).toBe(false);
  expect(await shown(page)).toEqual({ play: 'Jouer', lang: 'fr', pendingSeen: false }); // jamais masqué, jamais traduit
});
