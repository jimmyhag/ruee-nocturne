// Phase 13 — compte facultatif : sans compte, rien ne part vers Firebase ; le panneau s'ouvre et se ferme ;
// le clavier reste au champ texte. Aucun test contre Firebase réel (règles vérifiées à la console, voir GATES).
import { expect, test } from '@playwright/test';
import { appMode, collectConsoleErrors, openGame, startRun } from './helpers';

const FIREBASE = /googleapis\.com|firebaseapp\.com|apis\.google\.com|gstatic\.com|\/__\//;

test('sans compte : aucune requête vers Firebase (ouverture, partie, mort, menu)', async ({ page }) => {
  const hits: string[] = [];
  page.on('request', (r) => {
    if (FIREBASE.test(r.url())) hits.push(r.url());
  });
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 3 }));
  await startRun(page, 2);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.warp(30);
    g.debug.kill();
  });
  await expect(page.locator('#over')).toBeVisible({ timeout: 8000 });
  await page.locator('#menuBtn').click();
  await expect(page.locator('#playBtn')).toBeVisible();
  expect(hits).toEqual([]);
  expect(errors).toEqual([]);
});

test('le panneau Compte s’ouvre, dit que les comptes sont indisponibles ici, se ferme, et le jeu se joue', async ({
  page,
}) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.locator('#accountBtn').click();
  await expect(page.locator('#account')).toBeVisible();
  expect(await appMode(page)).toBe('account');
  // vite preview n'a pas de /__/firebase/init.json : « indisponible », sans erreur console
  await expect(page.locator('#accStatus')).toContainText(/indisponibles|not available/, { timeout: 10_000 });
  await expect(page.locator('#accSignedOut')).toBeHidden();
  await expect(page.locator('#accSignedIn')).toBeHidden();
  await page.locator('#accountBackBtn').click();
  await expect(page.locator('#menu')).toBeVisible();
  expect(await appMode(page)).toBe('menu');
  await startRun(page, 1);
  expect(await appMode(page)).toBe('play');
  expect(errors).toEqual([]);
});

test('clavier : Espace et Entrée restent au champ texte (compte et sauvegarde), pas au jeu', async ({ page }) => {
  await openGame(page);
  // zone de sauvegarde des réglages : Espace était avalé par le saut
  await page.locator('#settingsBtn').click();
  await page.locator('#saveText').click();
  await page.keyboard.type('a b');
  await expect(page.locator('#saveText')).toHaveValue('a b');
  await page.keyboard.press('Enter');
  expect(await appMode(page)).toBe('settings'); // Entrée n'a pas lancé la partie
  await page.locator('#settingsBackBtn').click();
  // champ e-mail du panneau Compte (le formulaire est caché tant que les comptes sont indisponibles : on le montre)
  await page.locator('#accountBtn').click();
  await page.evaluate(() => ((document.getElementById('accSignedOut') as HTMLElement).hidden = false));
  await page.locator('#accEmail').click();
  await page.keyboard.type('x y');
  await expect(page.locator('#accEmail')).toHaveValue('x y');
  expect(await appMode(page)).toBe('account');
});
