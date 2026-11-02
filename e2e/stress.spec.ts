// Mode stress (?stress=400) : 400 ennemis maintenus, budgets de rendu tenus (PLAN.md §4.3).
// Les fps ne sont pas vérifiés ici (SwiftShader) : ils se lisent sur un vrai téléphone, voir docs/GATES.md phase 1.
import { expect, test } from '@playwright/test';
import { collectConsoleErrors } from './helpers';

test('400 ennemis : budget de draw calls et de triangles tenu, onglet perf lisible', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/?debug=1&stress=400');
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  expect(await page.evaluate(() => (window as any).__game.debug.stressTarget)).toBe(400);

  await page.locator('#playBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.waitForFunction(() => (window as any).__game.world.enemyCount >= 380, null, { timeout: 15_000 });
  await page.waitForTimeout(2500); // quelques fenêtres de mesure

  const state = await page.evaluate(() => {
    const g = (window as any).__game;
    return {
      enemies: g.world.enemyCount as number,
      hp: g.world.player.hp as number,
      calls: g.renderer.info.render.calls as number,
      triangles: g.renderer.info.render.triangles as number,
      perf: (document.getElementById('perf') as HTMLElement).textContent ?? '',
      perfHidden: (document.getElementById('perf') as HTMLElement).hidden,
    };
  });
  expect(state.enemies).toBeGreaterThanOrEqual(380);
  expect(state.hp).toBeGreaterThan(1000); // god mode : on mesure le rendu, pas la survie
  expect(state.calls, 'draw calls ≤ 40').toBeLessThanOrEqual(40);
  expect(state.triangles, 'triangles ≤ 150 k').toBeLessThan(150_000);
  expect(state.perfHidden).toBe(false);
  expect(state.perf).toMatch(/fps \d+/);
  expect(state.perf).toMatch(/ennemis (3[89]\d|4\d\d|5\d\d)/);
  await page.screenshot({ path: `shots/${info.project.name}-stress.png`, animations: 'disabled' });
  console.log(`[${info.project.name}] ${state.perf.replace(/\n/g, ' | ')}`);
  expect(errors).toEqual([]);
});
