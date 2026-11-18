// 1.48.1 (retours de Jimmy) : le défi du jour s'explique avant de se lancer ; une Plume de phénix consommée quitte la
// barre d'équipement. Lot L3 : défi court (5:00), série de jours, missions du jour (docs/specs/l3-defi-serie-missions.md).
import { expect, test } from '@playwright/test';
import { appMode, collectConsoleErrors, openGame, startRun } from './helpers';

test('défi du jour : la feuille explique, liste les parties du jour et lance la partie', async ({
  page,
  hasTouch,
}, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  const today = new Date().toISOString().slice(0, 10);
  await page.evaluate(
    (date) =>
      (window as any).__game.setMeta({
        version: 5,
        runs: 2,
        character: 'bucheron',
        bought: ['bucheron'],
        achievements: ['survie3'],
        stats: { bestTime: 200 },
        daily: { date, times: [300, 95], kills: [412, 30] },
      }),
    today,
  );
  await expect(page.locator('#dailyBtn')).toContainText('Défi du jour · 5 min'); // lot L3 : la durée sur le bouton
  await page.locator('#dailyBtn').click();
  expect(await appMode(page)).toBe('daily'); // plus de lancement direct
  const sheet = page.locator('#daily');
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('dd')).toHaveCount(4);
  await expect(sheet).toContainText('Éclaireuse');
  // lot L3 : le temps tenu, puis les vaincus
  await expect(page.locator('#dailyTimes')).toHaveText(
    'Tes parties du jour : 1er 5:00 · 412 vaincus · 2e 1:35 · 30 vaincus',
  );
  await expect(page.locator('#dailyNext')).toHaveText(/^Nouveau défi dans (\d+ h \d\d|\d+ min)$/);
  // la feuille tient dans l'écran, bouton compris
  const vp = page.viewportSize()!;
  const btn = (await page.locator('#dailyPlayBtn').boundingBox())!;
  expect(btn.y + btn.height).toBeLessThanOrEqual(vp.height);
  await page.screenshot({ path: `shots/${info.project.name}-defi-du-jour.png` });
  // fermer puis rouvrir : Échap au clavier, la croix au doigt
  if (hasTouch) await page.locator('#dailyBackBtn').tap();
  else await page.keyboard.press('Escape');
  expect(await appMode(page)).toBe('menu');
  await page.locator('#dailyBtn').click();
  // lancer : Entrée au clavier (le bouton a le focus), un appui au doigt
  if (hasTouch) await page.locator('#dailyPlayBtn').tap();
  else await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  // le défi se joue avec l'Éclaireuse, quel que soit le personnage choisi
  expect(await page.evaluate(() => Object.keys((window as any).__game.world.weapons))).toEqual(['orbe']);
  // lot L3 : cinq minutes au monde 1, le kit de départ (une arme, deux tomes)
  expect(
    await page.evaluate(() => {
      const w = (window as any).__game.world;
      return [w.dailyEnd, w.stage, w.maxWeapons, w.maxTomes];
    }),
  ).toEqual([300, 0, 1, 2]);
  await expect(page.locator('#stageLbl')).toHaveText('Défi du jour');
  expect(errors).toEqual([]);
});

test('une Plume de phénix consommée quitte la barre d’équipement', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await startRun(page);
  await page.evaluate(() => {
    const g = (window as any).__game;
    for (let i = 0; i < g.world.enemies.length; i++) g.world.enemies[i].alive = false;
    g.world.enemyCount = 0;
    for (const k of ['pierre', 'phenix', 'phenix']) g.debug.item(k);
  });
  const feather = page.locator('#gear .git[aria-label*="phénix"]');
  await expect(feather).toHaveCount(1);
  await expect(feather.locator('b')).toHaveText('×2');
  const die = (): Promise<void> =>
    page.evaluate(() => {
      const P = (window as any).__game.world.player;
      P.invul = 0;
      P.hp = 0;
    });
  await die();
  await expect(feather.locator('b')).toHaveText('×1'); // une réanimation : il en reste une
  await page.locator('#gear').screenshot({ path: `shots/${info.project.name}-plume-restante.png` });
  await expect(page.locator('#gear .git')).toHaveCount(2);
  await die();
  await expect(feather).toHaveCount(0); // la dernière est partie, la Pierre à aiguiser reste
  await expect(page.locator('#gear .git')).toHaveCount(1);
  expect(await appMode(page)).toBe('play');
  expect(errors).toEqual([]);
});

// ---------- lot L3 : défi court, série de jours, missions du jour ----------
/** Date UTC (AAAA-MM-JJ) décalée de `d` jours depuis aujourd'hui, comme `todayKey`. */
const dayKey = (d = 0): string => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

test('The daily challenge starts by touch and with its key', async ({ page, hasTouch }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.evaluate(() =>
    (window as any).__game.setMeta({ version: 5, runs: 2, achievements: ['survie3'], reveal: 4, seenReveal: 4 }),
  );
  const btn = page.locator('#dailyBtn');
  await expect(btn).toBeVisible();
  if (hasTouch) {
    await btn.tap(); // au doigt : un appui ouvre la feuille, un autre lance
    await expect(page.locator('#daily')).toBeVisible();
    await page.locator('#dailyPlayBtn').tap();
  } else {
    // au clavier : le bouton a le focus, Entrée ouvre la feuille (le focus passe sur « Lancer le défi »), Entrée lance
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#daily')).toBeVisible();
    await expect(page.locator('#dailyPlayBtn')).toBeFocused();
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  expect(await page.evaluate(() => (window as any).__game.world.dailyEnd)).toBe(300);
  expect(errors).toEqual([]);
});

test('menu : la série sur le bouton du défi, le joker dit dès l’ouverture, les missions du jour', async ({
  page,
  hasTouch,
}, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  // série de 4 comptée avant-hier : hier est manqué, le joker de la semaine la sauve dès l'ouverture
  await page.evaluate(
    (last) =>
      (window as any).__game.setMeta({
        version: 5,
        runs: 6,
        character: 'bucheron',
        achievements: ['survie3', 'survie10'],
        unlocks: ['w:boomerang'],
        slots: { weapons: 2, passives: 2, rerolls: 0 }, // une mission d'arme demande un 2e emplacement
        streak: { last, count: 4, best: 4, jokerWeek: '' },
        reveal: 4,
        seenReveal: 4,
      }),
    dayKey(-2),
  );
  await expect(page.locator('#dailyStreak')).toBeVisible();
  await expect(page.locator('#dailyStreakN')).toHaveText('4');
  await expect(page.locator('#dailyStreak')).toHaveAttribute('aria-label', 'Série : 4 jours');
  await expect(page.locator('#streakNote')).toHaveText('Ta série est sauvée par le joker');
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.streak.last).toBe(dayKey(-1));
  expect(meta.streak.jokerWeek).not.toBe('');
  // trois missions du jour, tirées à l'ouverture : une de personnage, une d'arme
  const missions = page.locator('#missionList .mission');
  await expect(missions).toHaveCount(3);
  await expect(page.locator('#missionList .mission[data-k="char"]')).toHaveCount(1);
  await expect(page.locator('#missionList .mission[data-k="weapon"]')).toHaveCount(1);
  await expect(page.locator('#missionsCount')).toHaveText('0/3');
  // repliées au départ sur téléphone, ouvertes sur PC
  if (hasTouch) {
    await expect(missions.first()).toBeHidden();
    await page.locator('#missions summary').tap();
  }
  await expect(missions.first()).toBeVisible();
  await page.screenshot({ path: `shots/${info.project.name}-l3-menu.png` });
  // même jour, rouvert : mêmes missions
  const before = JSON.stringify(meta.missions);
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  expect(JSON.stringify(await page.evaluate(() => (window as any).__game.meta.missions))).toBe(before);
  await expect(page.locator('#streakNote')).toBeHidden(); // le joker a été dit à l'ouverture où il a servi
  await expect(page.locator('#dailyStreakN')).toHaveText('4');
  // en anglais
  await page.evaluate(() => {
    const g = (window as any).__game;
    const m = g.meta;
    g.setMeta({ ...m, settings: { ...m.settings, lang: 'en' } });
  });
  await expect(page.locator('#dailyBtn')).toContainText('Daily challenge · 5 min');
  await expect(page.locator('#missions summary')).toContainText('Daily missions');
  await expect(page.locator('#dailyStreak')).toHaveAttribute('aria-label', 'Streak: 4 days');
  expect(errors).toEqual([]);
});

test('fin du défi du jour : « Défi réussi ! », la série du jour, la tenue du 7e jour et la mission remplie', async ({
  page,
  hasTouch,
}, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  const today = dayKey();
  await page.evaluate(
    ([yesterday, date]) =>
      (window as any).__game.setMeta({
        version: 5,
        runs: 6,
        gold: 0,
        character: 'eclaireuse',
        achievements: ['survie3'],
        streak: { last: yesterday, count: 6, best: 6, jokerWeek: '' },
        missions: { date, list: [{ k: 'survive', p: '', goal: 4, prog: 0, done: false }] },
        reveal: 4,
        seenReveal: 4,
      }),
    [dayKey(-1), today],
  );
  await expect(page.locator('#missionList .mission')).toHaveCount(1);
  await page.locator('#dailyBtn').click();
  await page.locator('#dailyPlayBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  // vivant à 5:00 : le défi est réussi
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.t = g.world.stageT = 299.5;
  });
  await page.waitForFunction(() => (window as any).__game.app === 'over');
  await expect(page.locator('#over')).toBeVisible();
  await expect(page.locator('#oTitle')).toHaveText('Défi réussi !');
  await expect(page.locator('#oRewards p')).toHaveText([
    'Série : 7 jours · +100 or',
    'Tenue offerte : Éclaireuse',
    'Mission remplie : Tiens 4 minutes en une partie · +60 or',
  ]);
  await page.screenshot({ path: `shots/${info.project.name}-l3-defi-reussi.png` });
  const m = await page.evaluate(() => (window as any).__game.meta);
  expect(m.streak).toMatchObject({ last: today, count: 7, best: 7 });
  expect(m.outfits).toContain('eclaireuse');
  expect(m.missions.list[0].done).toBe(true);
  expect(m.daily.times[0]).toBe(300);
  // au menu, la mission est cochée et toutes sont faites (sur téléphone, le bloc s'ouvre d'un appui)
  await page.locator('#menuBtn').click();
  await expect(page.locator('#missionsCount')).toHaveText('1/1');
  if (hasTouch) await page.locator('#missions summary').tap();
  await expect(page.locator('#missionList .mission.done')).toHaveCount(1);
  await expect(page.locator('#missionsDone')).toBeVisible();
  await expect(page.locator('#dailyStreakN')).toHaveText('7');
  expect(errors).toEqual([]);
});
