// Phase 31 : relance des cartes à la montée de niveau (clavier R, bouton au doigt), achat de relances dans la boutique,
// nouveaux objets (cartes et soin annoncé). Captures lues pour le bouton et les cartes des nouveaux objets.
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

test('montée de niveau : une relance, au clavier (R) ou au doigt, puis plus aucune', async ({
  page,
  hasTouch,
}, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 3);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.debug.levelUp();
  });
  await page.waitForSelector('#levelup:not([hidden])');
  const btn = page.locator('#luReroll');
  await expect(btn).toBeVisible();
  await expect(btn).toBeEnabled();
  await expect(btn).toHaveText('Relancer (1)');
  await page.screenshot({ path: `shots/${info.project.name}-relance.png` });
  const keys = () =>
    page.evaluate(() =>
      ((window as any).__game.world.cards as { kind: string; key: string }[]).map((c) => c.kind + c.key).join(','),
    );
  const before = await keys();
  if (hasTouch) await btn.tap();
  else await page.keyboard.press('KeyR');
  await expect(btn).toBeDisabled();
  await expect(btn).toHaveText('Plus de relance');
  const after = await keys();
  expect(after).not.toBe(before);
  expect(await page.evaluate(() => (window as any).__game.world.rerolls)).toBe(0);
  // R de nouveau : sans effet
  if (!hasTouch) {
    await page.keyboard.press('KeyR');
    expect(await keys()).toBe(after);
  }
  // la carte se prend toujours
  if (hasTouch) await page.locator('#cards .card').first().tap();
  else await page.keyboard.press('Digit1');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  expect(errors).toEqual([]);
});

test('coffre : pas de bouton de relance', async ({ page }) => {
  await openGame(page);
  await startRun(page, 4);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    g.debug.chest();
  });
  await page.waitForSelector('#levelup:not([hidden])');
  await expect(page.locator('#luTitle')).toHaveText('Coffre');
  await expect(page.locator('#luReroll')).toBeHidden();
});

test('boutique : acheter des relances, elles s’ajoutent à la partie suivante', async ({ page, hasTouch }, info) => {
  await openGame(page);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 4, gold: 2500 }));
  await page.locator('#shopBtn').click();
  await expect(page.locator('#shop')).toBeVisible();
  await expect(page.locator('#rerollNote')).toContainText('1 par partie');
  const buy = page.locator('#rerollList [data-reroll]').first();
  if (hasTouch) await buy.tap();
  else await buy.click();
  await expect(page.locator('#rerollNote')).toContainText('2 par partie');
  await expect(page.locator('#shopGold')).toHaveText(/^2\D?000 or$/);
  await page.screenshot({ path: `shots/${info.project.name}-boutique-relances.png` });
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.slots.rerolls).toBe(1);
  await page.locator('#shopBackBtn').click();
  await startRun(page, 5);
  expect(await page.evaluate(() => (window as any).__game.world.rerolls)).toBe(2);
});

test('nouveaux objets : cartes du coffre et soin du vol de vie annoncé', async ({ page }, info) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 6);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.world.player.need = 1e9;
    // coffre limité aux nouveaux objets (phase 31) : les 20 premiers sont « interdits » le temps du tirage
    for (let i = 0; i < 20; i++) g.world.itemBan[i] = 1;
    for (let i = 32; i < g.itemKeys.length; i++) g.world.itemBan[i] = 1; // phase 47 B : seize objets de plus, testés ailleurs
    g.debug.chest();
  });
  await page.waitForSelector('#levelup:not([hidden])');
  await page.screenshot({ path: `shots/${info.project.name}-objets-p31.png` });
  const kinds = await page.evaluate(() => ((window as any).__game.world.cards as { key: string }[]).map((c) => c.key));
  const fresh = [
    'croc',
    'calice',
    'mousse',
    'souffle',
    'pierre',
    'de',
    'gant',
    'brume',
    'sandales',
    'amulette',
    'ecorce',
    'couronne',
  ];
  for (const k of kinds) expect(fresh).toContain(k);
  // vol de vie : Croc, PV bas, ennemis à frapper → chiffre vert
  await page.locator('#cards .card').first().click();
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.item('croc');
    g.world.player.maxHp = 1000;
    g.world.player.hp = 100;
    g.world.player.invul = 1e9; // pas de dégâts reçus : seul le soin des objets fait bouger les PV
    g.debug.give('aura', 8);
    g.debug.spawn(0, 12, 2);
  });
  // annoncé une fois par seconde de jeu (SwiftShader : le temps de jeu avance lentement sous 12 ennemis)
  await page.waitForSelector('#dmg span.heal:not([hidden])', { timeout: 45_000 });
  await page.screenshot({ path: `shots/${info.project.name}-vol-de-vie.png` });
  expect(await page.evaluate(() => (window as any).__game.world.player.hp)).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});
