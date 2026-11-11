// Phase 37 : trois mondes. Chrono du monde et puce d'objectif ; on active le totem en marchant dedans (clavier et
// doigt), le boss du monde arrive ; boss tué (crochet de debug), le portail s'ouvre ; on y entre en marchant : monde 2,
// nouvelle carte, autre ambiance. Chrono écoulé : bannière, dépassement en rouge, plus de passage. Captures lues.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

/** Marche vers la droite (+x) jusqu'à ce que `done` soit vrai : flèche au clavier, joystick flottant au doigt. */
async function walkRightUntil(page: Page, hasTouch: boolean, done: () => boolean): Promise<void> {
  if (!hasTouch) {
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(done, null, { timeout: 30_000 }).finally(() => page.keyboard.up('ArrowRight'));
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const vp = page.viewportSize()!;
  const x0 = Math.round(vp.width * 0.25),
    y0 = Math.round(vp.height * 0.6);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + i * 10, y: y0, id: 1 }] });
    await page.waitForTimeout(30);
  }
  await page
    .waitForFunction(done, null, { timeout: 30_000 })
    .finally(() => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }));
}

/** Partie calme : héros invulnérable, sans montée de niveau, ni bonus, ni marchand, ennemis retirés. */
async function calm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    const w = g.world;
    w.player.need = 1e9;
    w.powerNext = w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.merchant.next = 99;
    w.enemyCount = 0;
  });
}
/** Pose le héros à 2,5 u à gauche du totem (ou du portail : même endroit). */
async function besideTotem(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.teleport(g.world.totem.x - 2.5, g.world.totem.z);
  });
}
function nearTotem(): boolean {
  const w = (window as any).__game.world;
  return Math.hypot(w.player.x - w.totem.x, w.player.z - w.totem.z) < 1.5; // dans le cercle (rayon 3)
}

test('monde 1 → 2 : chrono, totem activé en marchant, boss, portail, nouvelle carte et ambiance', async ({
  page,
  hasTouch,
}, info) => {
  test.setTimeout(150_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await calm(page);
  await expect(page.locator('#stageLbl')).toHaveText(/1/);
  await expect(page.locator('#time')).toHaveText(/^(10:00|9:5\d)$/);
  await expect(page.locator('#goalChip')).toBeVisible();
  await expect(page.locator('#goalChip')).toHaveClass(/g1/);
  // totem : on marche dedans, on y reste, le boss du monde arrive
  await besideTotem(page);
  await walkRightUntil(page, hasTouch, nearTotem);
  await page.waitForFunction(() => (window as any).__game.world.totem.state === 1, null, { timeout: 40_000 });
  await expect(page.locator('#bossbar')).toBeVisible();
  await expect(page.locator('#goalChip')).toHaveClass(/g2/);
  const seed1 = await page.evaluate(() => (window as any).__game.world.seed);
  // boss tué : portail ouvert à la place du totem
  await page.evaluate(() => (window as any).__game.debug.killBoss());
  await page.waitForFunction(() => (window as any).__game.world.portal.open === true);
  await expect(page.locator('#goalChip')).toHaveClass(/g3/);
  await page.waitForFunction(() => (window as any).__game.app === 'play', null, { timeout: 20_000 }); // coffre du boss
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.world.chestCount = 0; // le coffre du boss suit le joueur, pas besoin ici
    g.world.enemyCount = 0;
  });
  await besideTotem(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `shots/${info.project.name}-portail.png` });
  // au doigt, la marche est plus lente : le portail (1 s dedans) peut emmener le héros avant le centre
  await walkRightUntil(page, hasTouch, () => {
    const w = (window as any).__game.world;
    return w.stage === 1 || Math.hypot(w.player.x - w.totem.x, w.player.z - w.totem.z) < 1.5; // dans le cercle (rayon 3)
  });
  await page.waitForFunction(() => (window as any).__game.world.stage === 1, null, { timeout: 40_000 });
  await calm(page);
  await expect(page.locator('#stageLbl')).toHaveText(/2/);
  await expect(page.locator('#goalChip')).toHaveClass(/g1/);
  const s = await page.evaluate(() => {
    const w = (window as any).__game.world;
    return { seed: w.seed, stageT: w.stageT, x: w.player.x, z: w.player.z };
  });
  expect(s.seed).not.toBe(seed1);
  expect(s.stageT).toBeLessThan(30);
  await page.waitForTimeout(1200); // fondu terminé
  await page.screenshot({ path: `shots/${info.project.name}-monde2.png` });
  expect(errors).toEqual([]);
});

test('chrono écoulé sans avoir appelé le boss : dépassement en rouge, le totem reste à activer (1.45.2)', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await calm(page);
  await page.evaluate(() => (window as any).__game.debug.stageTime(598));
  await page.waitForFunction(() => (window as any).__game.world.overT > 0, null, { timeout: 30_000 });
  await expect(page.locator('#timeBox')).toHaveClass(/over/);
  await expect(page.locator('#time')).toHaveText(/^\+0:0\d$/);
  await expect(page.locator('#goalChip')).toHaveClass(/g1/);
  expect(await page.evaluate(() => (window as any).__game.world.totem.state)).toBe(0);
  // dans le cercle : la jauge d'activation s'affiche, comme pour un sanctuaire, et le boss arrive malgré le chrono
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    w.player.x = w.player.px = w.totem.x;
    w.player.z = w.player.pz = w.totem.z;
  });
  await expect(page.locator('#poiChip')).toBeVisible();
  await expect(page.locator('#poiChip')).toHaveClass(/totem/);
  await expect(page.locator('#poiText')).toHaveText('Totem du boss');
  await page.waitForFunction(() => (window as any).__game.world.totem.state === 1, null, { timeout: 40_000 });
  await expect(page.locator('#poiChip')).toBeHidden();
  await expect(page.locator('#goalChip')).toHaveClass(/g2/);
  expect(errors).toEqual([]);
});

test('captures : les trois ambiances, totem et colonne de lumière en vue', async ({ page }, info) => {
  test.setTimeout(120_000);
  await openGame(page);
  await startRun(page);
  for (let k = 0; k < 3; k++) {
    if (k > 0) await page.evaluate(() => (window as any).__game.debug.nextStage());
    await calm(page);
    await page.evaluate(() => {
      const g = (window as any).__game;
      g.debug.teleport(g.world.totem.x - 7, g.world.totem.z + 7);
      g.world.stageT = 300; // milieu du chrono : lumière entre crépuscule et nuit
    });
    await page.waitForTimeout(1500);
    expect(await page.evaluate(() => (window as any).__game.world.stage)).toBe(k);
    await page.screenshot({ path: `shots/${info.project.name}-ambiance-${k + 1}.png` });
  }
});
