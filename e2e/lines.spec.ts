// Phase 23 : cartes de niveau variées (jamais deux fois la même ligne sur une carte) et coup critique à l'écran.
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

test('montée de niveau : chaque carte a des lignes toutes différentes ; un critique s’affiche en doré', async ({
  page,
}, info) => {
  const p = info.project.name;
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  await startRun(page, 4);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.luck = 30; // cartes à 2 et 3 lignes
  });
  for (let round = 0; round < 6; round++) {
    await page.evaluate(() => (window as any).__game.debug.levelUp());
    await page.waitForSelector('#levelup:not([hidden])');
    const cards = await page.$$eval('#levelup .card', (els) =>
      els.map((el) => Array.from(el.querySelectorAll('ul.lines li')).map((li) => li.textContent ?? '')),
    );
    expect(cards.length).toBeGreaterThan(0);
    for (const lines of cards) expect(new Set(lines).size, lines.join(' | ')).toBe(lines.length);
    if (round === 0) await page.screenshot({ path: `shots/${p}-cartes-lignes.png`, animations: 'disabled' });
    await page.keyboard.press('1');
    await page.waitForFunction(() => (window as any).__game.app === 'play');
  }
  // coup critique : 100 % de critique sur l'Orbe, des ennemis autour
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.world.player.need = 1e9;
    g.world.wstats.orbe.crit = 1;
    g.debug.spawn(0, 8, 4);
  });
  await page.waitForSelector('#dmg span.crit:not([hidden])', { timeout: 10_000 });
  await expect(page.locator('#dmg span.crit:not([hidden])').first()).toHaveText(/^\d+!$/);
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(100);
  await page.screenshot({ path: `shots/${p}-critique.png`, animations: 'disabled' });
  await page.evaluate(() => (window as any).__game.debug.speed(1));
  expect(errors).toEqual([]);
});
