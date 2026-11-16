// Phase 53 (demandes de Jimmy) : l'intensité des ennemis se lit en jeu et en pause ; la carte explorée à 100 %
// s'annonce et rapporte de l'or.
import { expect, test } from '@playwright/test';
import { collectConsoleErrors, openGame, startRun } from './helpers';

/** « ×2,4 » → 2.4 */
const mult = (s: string): number => +s.replace(/^.*×/, '').replace(',', '.');

test('intensité des ennemis : « Ennemis ×1,0 » au départ, elle monte avec le temps ; le détail est dans la pause', async ({
  page,
  hasTouch,
}, info) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  const p = info.project.name;
  await openGame(page);
  await startRun(page, 9);
  const chip = page.locator('#foesLbl');
  const value = page.locator('#foesTxt');
  await expect(chip).toBeVisible();
  await expect(value).toHaveText('×1,0');
  await expect(chip).toHaveAttribute('aria-label', 'Ennemis ×1,0');
  // sur téléphone, icône et valeur seulement : la pastille ne doit pas passer sous la puce d'objectif, au centre
  await expect(chip.locator('.lbl')).toBeVisible({ visible: !hasTouch });
  // quatre minutes plus loin dans le monde : les monstres ont plus de PV, la pastille le dit
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.world.player.need = 1e9; // pas de montée de niveau : son écran masquerait le bouton pause
    g.debug.warp(240);
    g.debug.god();
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'pixel' } }); // pas de bannière « Rendu allégé »
  });
  await expect.poll(async () => mult(await value.innerText()), { timeout: 20_000 }).toBeGreaterThan(1.5);
  const shown = mult(await value.innerText());
  // la puce d'objectif (centrée, sous le chrono) et la pastille ne se recouvrent pas
  const boxes = await page.evaluate(() => {
    const r = (id: string) => document.getElementById(id)!.getBoundingClientRect();
    const a = r('foesLbl'),
      g = r('goalChip');
    return {
      right: a.right,
      bottom: a.bottom,
      top: a.top,
      gLeft: g.left,
      gTop: g.top,
      gBottom: g.bottom,
      gOn: g.width > 0,
    };
  });
  if (boxes.gOn && boxes.bottom > boxes.gTop && boxes.top < boxes.gBottom)
    expect(boxes.right).toBeLessThanOrEqual(boxes.gLeft);
  await page.screenshot({ path: `shots/${p}-intensite.png` });
  // la pause détaille les quatre multiplicateurs ; les PV sont ceux de la pastille
  if (hasTouch) await page.locator('#pauseBtn').tap();
  else await page.locator('#pauseBtn').click();
  await expect(page.locator('#pause')).toBeVisible();
  const rows = page.locator('#pauseStats .statgroup.g-ennemis li');
  await expect(rows).toHaveCount(4);
  await expect(page.locator('#pauseStats .statgroup.g-ennemis h4')).toHaveText('Ennemis');
  for (const name of ['PV des monstres', 'Dégâts des monstres', 'Vitesse des monstres', 'Apparitions de monstres'])
    await expect(page.locator('#pauseStats .statgroup.g-ennemis')).toContainText(name);
  const hp = mult(await rows.filter({ hasText: 'PV des monstres' }).locator('b').innerText());
  expect(Math.abs(hp - shown)).toBeLessThanOrEqual(0.11); // le temps a pu avancer d'un dixième entre les deux lectures
  for (let i = 0; i < 4; i++) expect(mult(await rows.nth(i).locator('b').innerText())).toBeGreaterThan(1);
  await page.locator('#pauseStats .statgroup.g-ennemis').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `shots/${p}-pause-ennemis.png`, animations: 'disabled' });
  expect(errors).toEqual([]);
});

test('carte explorée à 100 % : annonce, prime d’or, une seule fois ; la grande carte le dit', async ({
  page,
  hasTouch,
}, info) => {
  test.setTimeout(120_000);
  const errors = collectConsoleErrors(page);
  const p = info.project.name;
  await openGame(page);
  await startRun(page, 9);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'pixel' } });
    // chaque texte de bannière est noté : elle ne reste que 1,8 s à l'écran
    const b = document.getElementById('banner')!;
    const seen: string[] = ((window as any).__banners = []);
    new MutationObserver(() => seen.push(b.textContent ?? '')).observe(b, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
  const gold0 = await page.evaluate(() => (window as any).__game.world.gold as number);
  expect(await page.evaluate(() => (window as any).__game.world.exploredAll)).toBe(false);
  await page.evaluate(() => (window as any).__game.debug.reveal());
  await page.waitForFunction(() => (window as any).__game.world.exploredAll === true, null, { timeout: 20_000 });
  await expect
    .poll(() => page.evaluate(() => ((window as any).__banners as string[]).join(' | ')), { timeout: 10_000 })
    .toMatch(/Carte explorée à 100 % : \+200 or/);
  await page.screenshot({ path: `shots/${p}-exploree.png` });
  const gold1 = await page.evaluate(() => (window as any).__game.world.gold as number);
  expect(gold1 - gold0).toBeGreaterThanOrEqual(200);
  // une seule fois : dix secondes de jeu plus tard, pas de seconde annonce
  await page.waitForTimeout(3000);
  const banners = await page.evaluate(() => (window as any).__banners as string[]);
  expect(banners.filter((b) => b.startsWith('Carte explorée')).length).toBe(1);
  // la grande carte affiche 100 %
  if (hasTouch) await page.locator('#minimap').tap();
  else await page.keyboard.press('KeyM');
  await expect(page.locator('#map')).toBeVisible();
  await expect(page.locator('#mapExplored')).toHaveText(/100\s?% exploré/);
  expect(errors).toEqual([]);
});
