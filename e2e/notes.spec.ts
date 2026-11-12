// 1.49.0 (demande de Jimmy) : la feuille « Nouveautés » liste les versions du jeu depuis le journal du projet.
import { expect, test } from '@playwright/test';
import { appMode, collectConsoleErrors, openGame } from './helpers';

const setMeta = (page: import('@playwright/test').Page, m: Record<string, unknown>): Promise<void> =>
  page.evaluate((meta) => (window as any).__game.setMeta({ version: 5, ...meta }), m);

test('Nouveautés : bouton au menu, pastille, versions repliables, anciennes versions', async ({
  page,
  hasTouch,
}, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  const version = (await page.locator('#version').innerText()).replace(/^v/, '');
  const btn = page.locator('#notesBtn');
  await expect(btn).toBeVisible();
  await expect(btn).toContainText('Nouveautés');
  await expect(btn).toContainText(`v${version}`);
  await expect(page.locator('#notesDot')).toBeHidden(); // nouveau joueur : rien à signaler

  // un joueur d'avant la feuille : la pastille s'allume
  await setMeta(page, { runs: 3 });
  await expect(page.locator('#notesDot')).toBeVisible();
  await page.screenshot({ path: `shots/${info.project.name}-menu-nouveautes.png` });

  await btn.click();
  expect(await appMode(page)).toBe('notes');
  const items = page.locator('#notesList details');
  await expect(items).toHaveCount(8);
  await expect(items.first()).toHaveAttribute('data-v', version); // la version du jeu est en tête…
  await expect(items.first()).toHaveAttribute('open', ''); // … et ouverte
  await expect(page.locator('#notesList details[open]')).toHaveCount(1);
  await expect(items.first().locator('li').first()).toBeVisible();
  await expect(page.locator('#notesList')).not.toContainText('Jimmy');
  await page.screenshot({ path: `shots/${info.project.name}-nouveautes.png` });

  // déplier une autre version : un appui (ou Entrée au clavier) sur son titre
  const second = items.nth(1);
  if (hasTouch) await second.locator('summary').tap();
  else {
    await second.locator('summary').focus();
    await page.keyboard.press('Enter');
  }
  await expect(second).toHaveAttribute('open', '');
  await expect(second.locator('li').first()).toBeVisible();

  // les anciennes versions
  const more = page.locator('#notesMore');
  await expect(more).toContainText('Versions plus anciennes');
  await more.click();
  expect(await items.count()).toBeGreaterThan(60);
  await expect(more).toBeHidden();
  await expect(items.last()).toHaveAttribute('data-v', /^1\.0\.0$|^0\./);
  // rien ne déborde en largeur
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // fermer : Échap au clavier, la croix au doigt ; la pastille est éteinte, la version est notée sur l'appareil
  if (hasTouch) await page.locator('#notesBackBtn').tap();
  else await page.keyboard.press('Escape');
  expect(await appMode(page)).toBe('menu');
  await expect(page.locator('#notesDot')).toBeHidden();
  expect(await page.evaluate(() => (window as any).__game.meta.seenNotes)).toBe(version);
  expect(errors).toEqual([]);
});

test('Nouveautés : les versions arrivées depuis la dernière lecture sont marquées', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await setMeta(page, { runs: 3, seenNotes: '1.47.0' });
  await expect(page.locator('#notesDot')).toBeVisible();
  await page.locator('#notesBtn').click();
  // le journal arrive par un import à la demande : count() n'attend pas, on attend d'abord qu'il soit rendu
  await expect(page.locator('#notesList details[data-v="1.48.0"]')).toBeVisible();
  const fresh = page.locator('#notesList details:has(.badge.new)');
  expect(await fresh.count()).toBeGreaterThanOrEqual(3); // 1.48.0, 1.48.1, 1.49.0 au moins
  await expect(page.locator('#notesList details[data-v="1.48.0"] .badge.new')).toHaveCount(1);
  await expect(page.locator('#notesList details[data-v="1.47.0"] .badge.new')).toHaveCount(0);
  await expect(page.locator('#notesList details[open]')).toHaveCount(3);
  await page.screenshot({ path: `shots/${info.project.name}-nouveautes-non-lues.png` });
  expect(errors).toEqual([]);
});
