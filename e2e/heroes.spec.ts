// Phase 20 : héros en vrais modèles animés (KayKit, CC0). Le glTF remplace le modèle procédural une fois chargé,
// les animations suivent l'état du joueur (course, saut, sort), et sans réseau pour /models le repli procédural reste.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openGame, startRun } from './helpers';

const ALL = {
  version: 3,
  gold: 5000,
  achievements: ['survie3', 'survie10', 'kills500', 'boss1', 'win', 'intouchable'],
  bought: ['veilleuse', 'braconnier', 'colporteur'],
};
const CHARS = [
  'eclaireuse',
  'bucheron',
  'sorciere',
  'veilleuse',
  'braconnier',
  'sapeur',
  'feufollet',
  'revenante',
  'colporteur',
];

const heroKind = (page: Page) => page.evaluate(() => (window as any).__game.scene.heroKind as string);

test('le héros glTF remplace le modèle procédural, au menu puis en partie', async ({ page }, info) => {
  const p = info.project.name;
  await openGame(page);
  await page.evaluate((m) => (window as any).__game.setMeta(m), { ...ALL, character: 'bucheron' });
  await page.waitForFunction(
    () => (window as any).__game.scene.modelKey === 'bucheron' && (window as any).__game.scene.heroKind === 'gltf',
    null,
    { timeout: 15000 },
  );
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/${p}-heros-menu.png`, animations: 'disabled' });
  await startRun(page, 5);
  await page.waitForFunction(() => (window as any).__game.scene.heroKind === 'gltf', null, { timeout: 15000 });
  await page.evaluate(() => (window as any).__game.debug.god());
  await page.waitForTimeout(800);
  await page.screenshot({ path: `shots/${p}-heros-jeu.png`, animations: 'disabled' });
});

test('les neuf héros se chargent (captures au menu)', async ({ page }, info) => {
  test.setTimeout(180_000);
  const p = info.project.name;
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  for (const c of CHARS) {
    await page.evaluate((c) => (window as any).__game.scene.setCharacter(c, 0), c);
    await page.waitForFunction(
      (c) => {
        const s = (window as any).__game.scene;
        return s.modelKey === c && s.heroKind === 'gltf';
      },
      c,
      { timeout: 15000 },
    );
    await page.waitForTimeout(400);
    await page.screenshot({ path: `shots/${p}-heros-${c}.png`, animations: 'disabled' });
  }
});

test('sans réseau pour /models, le modèle procédural reste et la partie se joue', async ({ page }) => {
  await page.route('**/models/**', (r) => r.abort());
  await openGame(page);
  await startRun(page, 6);
  await page.waitForTimeout(1500);
  expect(await heroKind(page)).toBe('proc');
  expect(await page.evaluate(() => (window as any).__game.app)).toBe('play');
});
