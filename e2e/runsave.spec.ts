// Phase 49 (demande de Jimmy) : une partie en cours survit à un rafraîchissement ou à la fermeture de l'app.
import { expect, test, type Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

/** Ce qu'on compare avant et après le rechargement : l'état exact du monde. */
async function state(page: Page) {
  return page.evaluate(() => {
    const w = (window as any).__game.world;
    return {
      t: w.t,
      stage: w.stage,
      kills: w.kills,
      level: w.player.level,
      hp: w.player.hp,
      gold: w.gold,
      x: w.player.x,
      z: w.player.z,
      enemies: w.enemyCount,
      weapons: JSON.stringify(w.weapons),
      mode: w.mode,
      cards: JSON.stringify(w.cards),
    };
  });
}
const ready = (page: Page) => page.waitForFunction(() => (window as any).__game?.ready === true);

test('rafraîchir garde la partie : Reprendre la rouvre en pause, à l’identique', async ({ page }, info) => {
  test.setTimeout(150_000);
  const errors = collectConsoleErrors(page);
  const p = info.project.name;
  await openGame(page);
  await expect(page.locator('#resumeRunBtn')).toBeHidden();
  await startRun(page, 7);
  // un seul appel : après warp le joueur retrouve ses PV normaux au milieu de la horde de 3:20. Avec god() dans un
  // second appel, il mourait entre les deux sur le runner de CI (partie finie : rien à reprendre, CI rouge de la 1.53.0)
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.warp(200); // 3:20, cartes prises en route
    g.debug.god();
    g.debug.speed(0); // la partie ne bouge plus entre la mesure et le rechargement
  });
  const before = await state(page);
  expect(before.t).toBeGreaterThan(190);
  expect(before.mode, 'le joueur doit être en vie avant le rechargement').not.toBe(2); // Mode.Dead

  await page.reload(); // pagehide : la partie est écrite avant que la page parte
  await ready(page);
  await expect(page.locator('#resumeRunBtn')).toBeVisible();
  await expect(page.locator('#resumeRunInfo')).toHaveText(/Monde 1 · 3:2\d/);
  await expect(page.locator('#playBtn')).toHaveClass(/ghost/);
  await page.screenshot({ path: `shots/${p}-reprendre.png` });

  await page.locator('#resumeRunBtn').click();
  await page.waitForFunction(() => ['pause', 'levelup'].includes((window as any).__game.app));
  expect(await state(page)).toEqual(before);
  await page.screenshot({ path: `shots/${p}-reprise.png` });

  // on continue : le temps avance de nouveau
  if ((await page.evaluate(() => (window as any).__game.app)) === 'pause') await page.locator('#resumeBtn').click();
  else await page.locator('#cards .card').first().click();
  await page.waitForFunction((t0) => (window as any).__game.world.t > t0 + 0.5, before.t);
  expect(errors).toEqual([]);
});

test('Menu dans la pause garde la partie ; Jouer demande avant de l’abandonner ; la mort l’efface', async ({
  page,
}) => {
  test.setTimeout(150_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 3);
  await page.evaluate(() => (window as any).__game.debug.warp(30));
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.locator('#pauseBtn').click();
  await page.locator('#quitBtn').click(); // « Menu » de la pause
  await expect(page.locator('#resumeRunBtn')).toBeVisible();
  await expect(page.locator('#resumeRunInfo')).toHaveText(/Monde 1 · 0:3\d/);

  // Jouer : confirmation, Annuler ne touche à rien
  await page.locator('#playBtn').click();
  await expect(page.locator('#abandonRow')).toBeVisible();
  await page.locator('#abandonNoBtn').click();
  await expect(page.locator('#abandonRow')).toBeHidden();
  await expect(page.locator('#resumeRunBtn')).toBeVisible();

  // Abandonner : une nouvelle partie part de zéro, l'ancienne est oubliée
  await page.locator('#playBtn').click();
  await page.locator('#abandonYesBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  expect(await page.evaluate(() => (window as any).__game.world.t)).toBeLessThan(5);

  // la mort termine la partie : plus rien à reprendre, même après un rechargement
  await page.evaluate(() => (window as any).__game.debug.kill());
  await page.waitForFunction(() => (window as any).__game.app === 'over');
  await page.reload();
  await ready(page);
  await expect(page.locator('#resumeRunBtn')).toBeHidden();
  await expect(page.locator('#playBtn')).toHaveClass(/big/);
  expect(errors).toEqual([]);
});

test('fermer pendant un choix de cartes : les mêmes cartes reviennent', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page, 5);
  await page.evaluate(() => (window as any).__game.debug.levelUp());
  await page.waitForFunction(() => (window as any).__game.app === 'levelup');
  const cards = await page.evaluate(() => JSON.stringify((window as any).__game.world.cards));
  await page.reload();
  await ready(page);
  await page.locator('#resumeRunBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'levelup');
  expect(await page.evaluate(() => JSON.stringify((window as any).__game.world.cards))).toBe(cards);
  await expect(page.locator('#cards .card')).toHaveCount(JSON.parse(cards).length);
  expect(errors).toEqual([]);
});
