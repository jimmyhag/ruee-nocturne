// Défi v2 (docs/specs/defi-v2.md) : règle du jour, boss final, médailles, suite en monde infini. Les scénarios de
// l'interface (titres en anglais), PC au clavier et téléphone au doigt ; la simulation et la méta sont testées dans
// src/meta/defi-v2.test.ts. Captures dans shots/ (copiées dans docs/captures/defi-v2/).
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { appMode, collectConsoleErrors, openGame } from './helpers';

/** Ordre de DAILY_RULE_KEYS (src/sim/balance.ts) : l'index est `world.dailyRule`. */
const RULE_KEYS = ['swift', 'elites', 'swarm', 'glass', 'giants', 'armory'];
const FR = JSON.parse(readFileSync(new URL('../src/i18n/fr.json', import.meta.url), 'utf8')) as Record<string, string>;
const EN = JSON.parse(readFileSync(new URL('../src/i18n/en.json', import.meta.url), 'utf8')) as Record<string, string>;
const dayKey = (d = 0): string => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

/**
 * Note chaque texte de bannière : une bannière dure 1,8 à 4 s et une autre peut prendre sa place (bonus.spec.ts) ; lire
 * #banner après coup arrive parfois trop tard sur un runner lent.
 */
async function recordBanners(page: Page): Promise<void> {
  await page.evaluate(() => {
    const b = document.getElementById('banner')!;
    const seen: string[] = ((window as any).__banners = []);
    new MutationObserver(() => seen.push(b.textContent ?? '')).observe(b, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });
}
const banners = (page: Page): Promise<string> =>
  page.evaluate(() => ((window as any).__banners as string[]).join(' | '));
/** Joueur qui a débloqué le défi du jour (succès « Première nuit »), tout dévoilé. */
async function dailyPlayer(page: Page, extra: Record<string, unknown> = {}): Promise<void> {
  await page.evaluate(
    (x) =>
      (window as any).__game.setMeta({
        version: 5,
        runs: 4,
        achievements: ['survie3'],
        reveal: 4,
        seenReveal: 4,
        ...x,
      }),
    extra,
  );
}
/** Captures : ni l'onglet perf du mode debug, ni les PV d'invincibilité dans le HUD (comme shots.spec.ts). */
async function forShot(page: Page): Promise<void> {
  await page.evaluate(() => {
    (document.getElementById('perf') as HTMLElement).hidden = true;
    const g = (window as any).__game;
    if (g.world) {
      g.world.player.maxHp = 100;
      g.world.player.hp = 86;
    }
  });
}
/** Ouvre la feuille du défi et lance la partie (au doigt ou au clavier). */
async function launchDaily(page: Page, hasTouch: boolean): Promise<void> {
  if (hasTouch) await page.locator('#dailyBtn').tap();
  else await page.locator('#dailyBtn').click();
  await expect(page.locator('#daily')).toBeVisible();
  if (hasTouch) await page.locator('#dailyPlayBtn').tap();
  else await page.keyboard.press('Enter'); // « Lancer le défi » a le focus
  await page.waitForFunction(() => (window as any).__game.app === 'play');
}
/** Joueur invincible amené à 5:00 : l'écran « Défi réussi ! ». */
async function toFiveMinutes(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.t = g.world.stageT = 299.5;
  });
  await page.waitForFunction(() => (window as any).__game.app === 'victory');
}

test('The rule of the day shows before and during the run', async ({ page, hasTouch }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await dailyPlayer(page);
  if (hasTouch) await page.locator('#dailyBtn').tap();
  else await page.locator('#dailyBtn').click();
  const sheet = page.locator('#daily');
  await expect(sheet).toBeVisible();
  // en tête des règles : « Règle du jour », son nom et sa phrase ; puis les trois médailles
  await expect(sheet.locator('dt').first()).toHaveText('Règle du jour');
  const name = (await page.locator('#dailyRuleName').textContent()) ?? '';
  expect(RULE_KEYS.map((k) => FR[`rule.${k}.name`])).toContain(name);
  await expect(page.locator('#dailyRuleText')).toHaveText(/\S.*\.$/);
  await expect(sheet.locator('.medals li')).toHaveText([
    'Bronze : en vie à 5:00',
    'Argent : et le boss final abattu',
    'Or : et en vie à 10:00',
  ]);
  await forShot(page);
  await page.screenshot({ path: `shots/${info.project.name}-defi-v2-feuille.png` });
  await sheet.locator('.medals').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `shots/${info.project.name}-defi-v2-feuille-medailles.png` });
  // la partie joue cette règle, l'annonce au départ et la rappelle dans la pause
  await recordBanners(page);
  if (hasTouch) await page.locator('#dailyPlayBtn').tap();
  else await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const rule = await page.evaluate(() => (window as any).__game.world.dailyRule as number);
  expect(FR[`rule.${RULE_KEYS[rule]}.name`]).toBe(name);
  const text = (await page.locator('#dailyRuleText').textContent()) ?? '';
  await expect.poll(() => banners(page), { timeout: 10_000 }).toContain(`Règle du jour : ${name}${text}`);
  if (hasTouch) await page.locator('#pauseBtn').tap();
  else await page.keyboard.press('Escape');
  await page.waitForFunction(() => (window as any).__game.app === 'pause');
  await expect(page.locator('#pauseRule')).toBeVisible();
  await expect(page.locator('#pauseRuleName')).toHaveText(name);
  await expect(page.locator('#pauseRuleText')).toHaveText(text);
  // en anglais
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, lang: 'en' } });
  });
  await expect(page.locator('#pauseRuleName')).toHaveText(EN[`rule.${RULE_KEYS[rule]}.name`]);
  expect(errors).toEqual([]);
});

test('Holding 5:00 gives bronze and offers to continue', async ({ page, hasTouch }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await dailyPlayer(page);
  await launchDaily(page, hasTouch);
  await toFiveMinutes(page);
  // le boss final est encore debout à 5:00 : bronze, et ce qui reste pour l'argent et l'or
  const v = page.locator('#victory');
  await expect(v).toBeVisible();
  await expect(page.locator('#vTitle')).toHaveText('Défi réussi !');
  await expect(page.locator('#vMedal')).toBeVisible();
  await expect(page.locator('#vMedalName')).toHaveText('Médaille de bronze');
  await expect(page.locator('#vNext li')).toHaveText([
    "Abats le boss final pour l'argent",
    "Tiens jusqu'à 10:00 pour l'or",
  ]);
  await expect(page.locator('#vContinue')).toHaveText('Continuer en monde infini');
  await expect(page.locator('#vContinue')).toHaveClass(/btn-full/);
  await expect(page.locator('#vEnd')).toHaveText('Terminer');
  // la feuille tient dans l'écran, boutons compris
  const vp = page.viewportSize()!;
  const end = (await page.locator('#vEnd').boundingBox())!;
  expect(end.y + end.height).toBeLessThanOrEqual(vp.height);
  await forShot(page);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${info.project.name}-defi-v2-reussi.png` });
  // terminer : 2 (ou Échap) au clavier, un appui au doigt ; la partie compte au classement du jour avec sa médaille
  if (hasTouch) await page.locator('#vEnd').tap();
  else await page.keyboard.press('Escape');
  await page.waitForFunction(() => (window as any).__game.app === 'over');
  await expect(page.locator('#oTitle')).toHaveText('Défi réussi !');
  await expect(page.locator('#oMedalName')).toHaveText('Médaille de bronze');
  const m = await page.evaluate(() => (window as any).__game.meta);
  expect(m.daily.times[0]).toBe(300);
  expect(m.daily.medals[0]).toBe(1);
  // au menu, la pastille de bronze remplace « fait »
  await page.locator('#menuBtn').click();
  await expect(page.locator('#dailyBtn')).toHaveAttribute('data-medal', '1');
  await expect(page.locator('#dailyRail')).toHaveText('bronze');
  await expect(page.locator('#dailyBtn')).toHaveAttribute('aria-label', /meilleure médaille : bronze/);
  // la feuille du défi montre la médaille de la partie
  await page.locator('#dailyBtn').click();
  await expect(page.locator('#dailyTimes > span').first().locator('.medal')).toHaveAttribute('data-m', '1');
  await expect(page.locator('#dailyTimes')).toHaveAttribute('aria-label', /Médaille de bronze/);
  expect(errors).toEqual([]);
});

test('Continuing extends the challenge in the endless world', async ({ page, hasTouch }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await dailyPlayer(page);
  await launchDaily(page, hasTouch);
  const rule = await page.evaluate(() => (window as any).__game.world.dailyRule as number);
  await toFiveMinutes(page);
  // continuer : 1 (ou Entrée) au clavier, un appui au doigt
  if (hasTouch) await page.locator('#vContinue').tap();
  else await page.keyboard.press('Digit1');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const w = await page.evaluate(() => {
    const g = (window as any).__game;
    return { endless: g.world.endless, rule: g.world.dailyRule, medal: g.world.medal, stage: g.world.stage };
  });
  expect(w).toEqual({ endless: true, rule, medal: 1, stage: 0 });
  // le chrono montre le temps total (5:00 et la suite), plus le compte à rebours
  await expect(page.locator('#time')).toHaveText(/^5:0\d$/);
  // le boss final tombe pendant la suite : la médaille d'argent, annoncée par une bannière
  await recordBanners(page);
  await page.evaluate(() => (window as any).__game.debug.slayBoss());
  await expect.poll(() => banners(page), { timeout: 10_000 }).toContain("Médaille d'argent !");
  expect(await page.evaluate(() => (window as any).__game.world.medal)).toBe(2);
  await forShot(page);
  await page.screenshot({ path: `shots/${info.project.name}-defi-v2-medaille.png` });
  await page.evaluate(() => (window as any).__game.debug.god());
  // l'XP du boss arrive : les cartes de niveau en attente se prennent (1 au clavier, un appui au doigt)
  for (let i = 0; i < 40 && (await appMode(page)) !== 'play'; i++) {
    if ((await appMode(page)) === 'levelup')
      if (hasTouch) await page.locator('#cards .card').first().tap();
      else await page.keyboard.press('Digit1');
    await page.waitForTimeout(250);
  }
  expect(await appMode(page)).toBe('play');
  // mort plus tard : le défi reste réussi, avec le temps total et la médaille d'argent
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.world.t = 432.4;
    g.debug.kill();
  });
  await page.waitForFunction(() => (window as any).__game.app === 'over');
  await expect(page.locator('#oTitle')).toHaveText('Défi réussi !');
  await expect(page.locator('#oMedalName')).toHaveText("Médaille d'argent");
  await expect(page.locator('#oTime')).toHaveText('7:12');
  const m = await page.evaluate(() => (window as any).__game.meta);
  expect([m.daily.times[0], m.daily.medals[0]]).toEqual([432, 2]);
  expect(errors).toEqual([]);
});

test('A friend’s challenge is played with the rule of its day', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto(`/?debug=1#defi=${dayKey(-1)}&t=120&k=50&n=Jimmy`);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await expect(page.locator('#challenge')).toBeVisible();
  const name = (await page.locator('#challengeRuleName').textContent()) ?? '';
  expect(RULE_KEYS.map((k) => FR[`rule.${k}.name`])).toContain(name);
  await page.locator('#challengePlayBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const rule = await page.evaluate(() => (window as any).__game.world.dailyRule as number);
  expect(FR[`rule.${RULE_KEYS[rule]}.name`]).toBe(name);
  expect(await appMode(page)).toBe('play');
  expect(errors).toEqual([]);
});
