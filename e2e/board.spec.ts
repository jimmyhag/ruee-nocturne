// Phase 38 : classement en ligne. Sans compte : l'écran invite à se connecter et rien ne part vers Firebase. Avec un
// compte (factice : Firebase n'est pas joignable en preview) : pseudo proposé depuis le compte, onglets, semaine, ta
// ligne surlignée, et le score de la partie envoyé à la fin. Clavier et doigt. Captures lues.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

const FIREBASE = /googleapis\.com|firebaseapp\.com|apis\.google\.com|gstatic\.com|\/__\//;

async function press(page: Page, sel: string, hasTouch: boolean): Promise<void> {
  if (hasTouch) await page.locator(sel).tap();
  else await page.locator(sel).click();
}

test('sans compte : invitation à se connecter, aucune requête vers Firebase', async ({ page, hasTouch }) => {
  const hits: string[] = [];
  page.on('request', (r) => {
    if (FIREBASE.test(r.url())) hits.push(r.url());
  });
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await press(page, '#boardBtn', hasTouch);
  await expect(page.locator('#board')).toBeVisible();
  await expect(page.locator('#boardInvite')).toBeVisible();
  await expect(page.locator('#boardLive')).toBeHidden();
  await press(page, '#boardBackBtn', hasTouch);
  await expect(page.locator('#menu')).toBeVisible();
  expect(hits).toEqual([]);
  expect(errors).toEqual([]);
});

test('connecté : pseudo, onglets, semaine, ta ligne, score envoyé en fin de partie', async ({
  page,
  hasTouch,
}, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    (window as any).__fake = g.fakeAccount('moi', [
      { uid: 'a', name: 'Zoé', char: 'sorciere', value: 31450 },
      { uid: 'moi', name: 'Testeur', char: 'eclaireuse', value: 21200 },
      { uid: 'b', name: 'Lou_42', char: 'bucheron', value: 10580 },
    ]);
  });
  // sans pseudo : l'écran envoie vers Compte, où un pseudo est proposé (prénom du compte)
  await press(page, '#boardBtn', hasTouch);
  await expect(page.locator('#boardPseudo')).toBeVisible();
  await press(page, '#boardPseudoBtn', hasTouch);
  await expect(page.locator('#account')).toBeVisible();
  await expect(page.locator('#accPseudo')).toHaveValue('Testeur');
  await page.locator('#accPseudo').fill('<Testeur>');
  await press(page, '#accPseudoBtn', hasTouch);
  await expect(page.locator('#accMsg')).toContainText('Testeur');
  expect(await page.evaluate(() => (window as any).__game.meta.pseudo)).toBe('Testeur');
  await press(page, '#accountBackBtn', hasTouch);
  // classement : trois lignes, la tienne surlignée, valeurs « Monde n · temps »
  await press(page, '#boardBtn', hasTouch);
  await expect(page.locator('#boardList .brow')).toHaveCount(3);
  await expect(page.locator('#boardList .brow.me .name')).toHaveText('Testeur');
  await expect(page.locator('#boardList .brow').first().locator('.val')).toHaveText('Monde 3 · 24:10');
  await expect(page.locator('#boardTabs [data-view="best"]')).toHaveClass(/selected/);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `shots/${info.project.name}-classement.png` });
  await press(page, '#boardTabs [data-view="kills"]', hasTouch);
  await expect(page.locator('#boardTabs [data-view="kills"]')).toHaveClass(/selected/);
  await press(page, '#boardWeek', hasTouch);
  await expect(page.locator('#boardWeek')).toHaveClass(/selected/);
  await press(page, '#boardBackBtn', hasTouch);
  // une partie, une mort : le score part avec le pseudo
  await startRun(page, 2);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.warp(30);
    g.debug.kill();
  });
  await expect(page.locator('#over')).toBeVisible({ timeout: 8000 });
  await page.waitForFunction(() => (window as any).__fake.sent.length === 1);
  const sent = await page.evaluate(() => (window as any).__fake.sent[0]);
  expect(sent).toMatchObject({ name: 'Testeur', stage: 1 });
  expect(sent.time).toBeGreaterThanOrEqual(30);
  expect(errors).toEqual([]);
});
