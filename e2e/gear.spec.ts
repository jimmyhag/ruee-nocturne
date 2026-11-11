// Phase 38 : barre d'équipement en bas de l'écran. Armes (icône + niveau) puis objets (pastille de rareté, « ×n » dès
// deux exemplaires) ; jamais sous les rappels de touches (PC) ni sous les boutons tactiles (téléphone, droitier et
// gaucher) ; au-delà de deux rangées, les plus anciens objets passent dans « +n ». Captures lues.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

type Box = { x: number; y: number; width: number; height: number };
const apart = (a: Box, b: Box) =>
  a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;

/** Partie calme avec trois armes et quelques objets, dont un Cœur en double. */
async function equip(page: Page, extra: string[] = []): Promise<void> {
  await page.evaluate((more) => {
    const g = (window as any).__game;
    g.debug.god();
    const w = g.world;
    w.player.need = 1e9;
    w.nextWave = w.nextElite = w.powerNext = 1e9;
    w.enemyCount = 0;
    w.weapons.lames = 3;
    w.weapons.foudre = 2;
    for (const k of ['coeur', 'talisman', 'coeur', 'bouclier', ...more]) g.debug.item(k);
  }, extra);
}

/** Toutes les boîtes des pastilles de la barre (le séparateur compris). */
async function gearBoxes(page: Page): Promise<Box[]> {
  const boxes: Box[] = [];
  for (const l of await page.locator('#gear > *').all()) boxes.push((await l.boundingBox())!);
  return boxes;
}

test('armes et objets ×n en bas, hors des touches et des boutons', async ({ page, hasTouch }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await equip(page);
  const gear = page.locator('#gear');
  await expect(gear).toBeVisible();
  expect(await page.locator('#gear .gw').count()).toBeGreaterThanOrEqual(3);
  await expect(page.locator('#gear .git')).toHaveCount(3); // Cœur (×2), Talisman, Bouclier
  await expect(page.locator('#gear .git b')).toHaveText(['×2']);
  await expect(page.locator('#gear .git').first()).toHaveAttribute('aria-label', /×2/);
  // en haut à gauche, il ne reste que les tomes et les synergies
  await expect(page.locator('#kit .item')).toHaveCount(0);
  const vp = page.viewportSize()!;
  const g = (await gear.boundingBox())!;
  expect(g.y + g.height, 'collée au bas de l’écran').toBeGreaterThan(vp.height - 80);
  const boxes = await gearBoxes(page);
  if (hasTouch) {
    for (const id of ['#btnJump', '#btnSpell', '#btnSlide']) {
      const b = (await page.locator(id).boundingBox())!;
      for (const x of boxes) expect(apart(x, b), `pastille sous ${id}`).toBe(true);
    }
  } else {
    const keys = (await page.locator('#keys').boundingBox())!;
    for (const x of boxes) expect(apart(x, keys), 'pastille sous les rappels de touches').toBe(true);
  }
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${info.project.name}-equipement.png` });
  // beaucoup d'objets : deux rangées au plus, les plus anciens dans « +n »
  await page.evaluate(() => {
    const g = (window as any).__game;
    const keys = [
      'phenix',
      'cape',
      'lanterne',
      'sablier',
      'epines',
      'bottes',
      'oeil',
      'aimant',
      'fer',
      'bourse',
      'rune',
      'collier',
      'patins',
      'echarpe',
      'plume',
      'boussole',
      'corne',
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
    for (const k of keys) g.debug.item(k);
  });
  const ys = (await gearBoxes(page)).map((b) => b.y + b.height / 2).sort((a, b) => a - b);
  const rows = { size: 1 + ys.filter((y, i) => i > 0 && y - ys[i - 1] > 10).length }; // centres à plus de 10 px
  expect(rows.size, 'deux rangées au plus (trois au doigt)').toBeLessThanOrEqual(hasTouch ? 3 : 2);
  await expect(page.locator('#gear .gmore')).toHaveCount(1);
  await expect(page.locator('#gear .gmore')).toHaveText(/^\+\d+$/);
  await page.waitForTimeout(200);
  await page.screenshot({ path: `shots/${info.project.name}-equipement-plein.png` });
  expect(errors).toEqual([]);
});

test('gaucher : la barre passe du côté droit, les boutons à gauche, sans chevauchement', async ({
  page,
  hasTouch,
}, info) => {
  test.skip(!hasTouch, 'boutons tactiles seulement');
  await openGame(page);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 3, settings: { lefty: true } }));
  await startRun(page);
  await equip(page, ['pierre', 'de', 'brume']);
  const boxes = await gearBoxes(page);
  for (const id of ['#btnJump', '#btnSpell', '#btnSlide']) {
    const b = (await page.locator(id).boundingBox())!;
    for (const x of boxes) expect(apart(x, b), `pastille sous ${id}`).toBe(true);
  }
  const vp = page.viewportSize()!;
  const g = (await page.locator('#gear').boundingBox())!;
  expect(g.x + g.width / 2, 'barre dans la moitié droite').toBeGreaterThan(vp.width / 2);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${info.project.name}-equipement-gaucher.png` });
});

test('écran de fin : la rangée d’équipement de la partie', async ({ page }) => {
  await openGame(page);
  await startRun(page);
  await equip(page);
  await page.evaluate(() => (window as any).__game.debug.kill());
  await page.waitForSelector('#over:not([hidden])', { timeout: 15_000 });
  await expect(page.locator('#oGear .git')).toHaveCount(3);
  await expect(page.locator('#oGear .git b')).toHaveText(['×2']);
});

// Phase 47 B : les Ailes de cire donnent un saut en l'air, par la même entrée que le saut (touche ou bouton).
test('Ailes de cire : un second saut en l’air, au clavier comme au doigt', async ({ page, hasTouch }) => {
  await openGame(page);
  await startRun(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    g.debug.item('ailes');
  });
  const jump = async () => {
    if (hasTouch) await page.locator('#btnJump').tap();
    else await page.keyboard.press('Space');
  };
  await jump();
  await page.waitForFunction(() => !(window as any).__game.world.player.onGround);
  await jump();
  await page.waitForFunction(() => (window as any).__game.world.player.airJumps === 1, null, { timeout: 8000 });
  // au sol, le saut en l'air est rendu
  await page.waitForFunction(() => {
    const P = (window as any).__game.world.player;
    return P.onGround && P.airJumps === 0;
  });
});
