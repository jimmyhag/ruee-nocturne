// Phase 19 : un sort par classe sur le bouton de l'ancien dash — lancé au clavier (Maj, PC) et au doigt (iPhone),
// recharge visible, nom du sort au HUD ; captures des neuf sorts.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openGame, startRun } from './helpers';

const ALL = {
  version: 3,
  gold: 5000,
  achievements: ['survie3', 'survie10', 'kills500', 'boss1', 'win', 'intouchable'],
  bought: ['veilleuse', 'braconnier', 'colporteur'],
};
const SPELLS: [string, string][] = [
  ['eclaireuse', 'Bond'],
  ['bucheron', 'Tourbillon'],
  ['sorciere', 'Clignement'],
  ['veilleuse', 'Éclat'],
  ['braconnier', 'Collet'],
  ['sapeur', 'Pétard'],
  ['feufollet', 'Comète'],
  ['revenante', 'Voile'],
  ['colporteur', 'Bourse'],
];

async function runAs(page: Page, character: string, seed: number): Promise<void> {
  await openGame(page);
  await page.evaluate((m) => (window as any).__game.setMeta(m), { ...ALL, character });
  await startRun(page, seed);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9; // pas d'écran de niveau pendant la capture
    (document.getElementById('perf') as HTMLElement).hidden = true;
  });
}
async function castSpell(page: Page, touch: boolean): Promise<void> {
  if (touch) await page.locator('#btnSpell').tap();
  else await page.keyboard.press('ShiftLeft');
}

test('sort de classe : Maj au clavier, bouton au doigt, nom du sort et recharge à l’écran', async ({
  page,
  hasTouch,
}) => {
  await runAs(page, 'veilleuse', 7);
  if (hasTouch) {
    await expect(page.locator('#spellName')).toHaveText('ÉCLAT');
    await expect(page.locator('#btnSpell')).toHaveAttribute('aria-label', 'Éclat');
  } else await expect(page.locator('#spellKey')).toHaveText('Éclat');
  await castSpell(page, hasTouch);
  await page.waitForFunction(() => (window as any).__game.world.sstate.casts === 1);
  // la recharge se voit : cône du bouton (tactile) ou barre sous Maj (PC) en dessous de plein
  const cd = await page.evaluate(() => {
    const b = document.getElementById('btnSpell') as HTMLElement;
    const bar = document.getElementById('spellbar') as HTMLElement;
    return { cone: parseFloat(b.style.getPropertyValue('--cd')), bar: parseFloat(bar.style.width) };
  });
  expect(Math.min(cd.cone, cd.bar / 100)).toBeLessThan(0.9);
  // relancé tout de suite : rien (recharge)
  await castSpell(page, hasTouch);
  await page.waitForTimeout(200);
  expect(await page.evaluate(() => (window as any).__game.world.sstate.casts)).toBe(1);
});

test('captures des neuf sorts', async ({ page, hasTouch }, info) => {
  test.setTimeout(300_000);
  const p = info.project.name;
  for (const [character, name] of SPELLS) {
    await runAs(page, character, 19);
    await page.evaluate(() => (window as any).__game.debug.spawn(0, 14, 4.5));
    await page.waitForTimeout(400);
    if (hasTouch) await expect(page.locator('#spellName')).toHaveText(name.toUpperCase());
    // on vise vers la droite (Collet, Bourse, Clignement, élans)
    if (!hasTouch) await page.keyboard.down('KeyD');
    const t0 = await page.evaluate(() => (window as any).__game.world.t as number);
    if (hasTouch) {
      await page.evaluate(() => {
        const P = (window as any).__game.world.player;
        P.dirX = 1;
        P.dirZ = 0;
      });
    }
    await castSpell(page, hasTouch);
    await page.waitForFunction(() => (window as any).__game.world.sstate.casts >= 1);
    await page.waitForFunction((t0) => (window as any).__game.world.t - t0 > 0.22, t0);
    if (!hasTouch) await page.keyboard.up('KeyD');
    await page.evaluate(() => (window as any).__game.debug.speed(0));
    await page.waitForTimeout(120);
    await page.screenshot({ path: `shots/${p}-sort-${character}.png`, animations: 'disabled' });
    await page.evaluate(() => (window as any).__game.debug.speed(1));
  }
});
