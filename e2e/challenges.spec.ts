// Phase 41 : défis par personnage. Fiche du personnage (3 défis), tenue de maître choisie au clavier ou au doigt une fois
// le défi III obtenu, et défi qui tombe en fin de partie (or versé, ligne « Débloqué »).
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, openCharacters, openGame } from './helpers';

test('fiche du personnage : 3 défis ; tenue de maître après le défi III', async ({ page, hasTouch }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.evaluate(() =>
    (window as any).__game.setMeta({
      version: 5,
      runs: 6,
      character: 'bucheron',
      achievements: ['survie10'],
      chars: { bucheron: { runs: 6, sig: 420, noHit: 95 } },
    }),
  );
  await openCharacters(page);
  await expect(page.locator('#charInfo .chal .ach')).toHaveCount(3);
  await expect(page.locator('#charInfo .chal')).toContainText('Bûcheron I');
  await expect(page.locator('#charInfo .chal')).toContainText('420 / 600');
  const master = page.locator('#charInfo [data-outfit="2"]');
  await expect(master).toHaveClass(/locked/);
  // clic sur une tenue verrouillée : rien ne change
  if (hasTouch)
    await master.tap({ force: true }); // aria-disabled : Playwright attendrait sinon qu'il s'active
  else await master.click({ force: true });
  expect(await page.evaluate(() => (window as any).__game.meta.outfit.bucheron)).toBeUndefined();
  await page.screenshot({ path: `shots/${info.project.name}-defis-fiche.png` });

  // défi III obtenu : la tenue de maître se choisit
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, achievements: ['survie10', 'c_bucheron_3'] });
  });
  await openCharacters(page);
  const m2 = page.locator('#charInfo [data-outfit="2"]');
  await expect(m2).not.toHaveClass(/locked/);
  if (hasTouch) await m2.tap();
  else {
    await m2.focus();
    await page.keyboard.press('Enter');
  }
  await expect(page.locator('#charInfo [data-outfit="2"]')).toHaveClass(/sel/);
  expect(await page.evaluate(() => (window as any).__game.meta.outfit.bucheron)).toBe(2);
  await page.waitForTimeout(1200); // atlas teinté de l'aperçu du menu
  await page.screenshot({ path: `shots/${info.project.name}-defis-tenue-maitre.png` });
  expect(errors).toEqual([]);
});

test('fin de partie : le défi I du personnage tombe, +500 or, ligne « Débloqué »', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 5, runs: 2, gold: 0, character: 'eclaireuse' }));
  await page.evaluate(() => (window as any).__game.start(1));
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.world.srcKills[0] = 520; // l'Orbe (arme de départ de l'Éclaireuse) : défi I à 500
    g.debug.kill();
  });
  await expect(page.locator('#over')).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#oUnlocked')).toContainText('Éclaireuse I');
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.achievements).toContain('c_eclaireuse_1');
  expect(meta.chars.eclaireuse.sig).toBe(520);
  expect(meta.gold).toBeGreaterThanOrEqual(500);
  expect(errors).toEqual([]);
});
