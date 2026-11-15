// Phase 52 (demande de Jimmy) : un sanctuaire peut donner n'importe quelle stat du jeu, « +1 projectile » compris.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

async function pickCard(page: Page, i: number, touch: boolean): Promise<void> {
  if (touch) await page.locator('#cards .card').nth(i).tap();
  else await page.keyboard.press(`Digit${i + 1}`);
}

test('sanctuaire : « +1 projectile », lu comme une ligne de tome, avec sa valeur actuelle → nouvelle ; pris, il compte', async ({
  page,
  hasTouch,
}, info) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  const p = info.project.name;
  await openGame(page);
  await startRun(page, 20);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'pixel' } }); // pas de bannière « Rendu allégé »
    const s = g.world.shrines[0];
    g.debug.teleport(s.x, s.z);
  });
  await page.waitForSelector('#levelup:not([hidden])', { timeout: 40_000 });
  await expect(page.locator('#luTitle')).toHaveText('Sanctuaire');
  await expect(page.locator('#cards .card')).toHaveCount(4);
  // les quatre offres sont tirées au sort : on en remplace trois par des bonus venus des tomes (dont le projectile),
  // puis on fait redessiner l'écran (un changement de langue le redessine : aller-retour par l'anglais)
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.world.cards[0].key = 'proj';
    g.world.cards[1].key = 'thorns';
    g.world.cards[2].key = 'shop';
    const lang = g.meta.settings.lang;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, lang: 'en' } });
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, lang } });
  });
  const card = page.locator('#cards .card');
  await expect(card.nth(0)).toContainText('Sanctuaire de la volée');
  await expect(card.nth(0)).toContainText('+1 projectile pour toutes les armes');
  await expect(card.nth(0).locator('p.now')).toHaveText('Projectiles en plus : 0 → 1');
  await expect(card.nth(1)).toContainText('Sanctuaire des ronces');
  await expect(card.nth(1).locator('p.now')).toHaveText('Riposte : 0 % → 100 %');
  await expect(card.nth(2)).toContainText('Sanctuaire du négoce');
  await expect(card.nth(2)).toContainText('−6 % sur les prix du marchand');
  await expect(card.nth(2).locator('p.now')).toHaveText('Prix du marchand : 100 % → 94 %');
  await expect(page.locator('#cards .card p.now')).toHaveCount(4);
  await page.screenshot({ path: `shots/${p}-sanctuaire-stats.png`, animations: 'disabled' });

  await pickCard(page, 0, hasTouch);
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const after = (await page.evaluate(() => {
    const w = (window as any).__game.world;
    return {
      proj: w.player.projAdd as number,
      boons: [...w.boons].reduce((a: number, b: number) => a + b, 0) as number,
    };
  })) as { proj: number; boons: number };
  expect(after).toEqual({ proj: 1, boons: 1 });

  // la fiche de stats de la pause : toutes les stats du jeu, le projectile gagné y figure
  if (hasTouch) await page.locator('#pauseBtn').tap();
  else await page.locator('#pauseBtn').click();
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('#pauseStats li')).toHaveCount(42); // 38 stats du héros, 4 lignes d'ennemis (phase 53)
  await expect(page.locator('#pauseStats li', { hasText: 'Projectiles en plus' }).locator('b')).toHaveText('1');
  for (const name of [
    'Riposte',
    'Garde (contact)',
    'Durée des projectiles',
    'Prix du marchand',
    'Fréquence des élites',
  ])
    await expect(page.locator('#pauseStats')).toContainText(name);
  await page.screenshot({ path: `shots/${p}-pause-stats.png`, animations: 'disabled' });
  expect(errors).toEqual([]);
});
