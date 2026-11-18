// Lot L4 (docs/specs/l4-partage-defi-amis.md) : carte de résultat, défi lancé à un ami par lien, classement du jour entre
// amis. Un test par scénario de la spec (titre en anglais) ; la logique pure (texte de la carte, lecture du lien, amis,
// tri) est aussi testée dans src/meta/share-card.test.ts. Le partage natif et le presse-papiers sont remplacés par des
// espions (aucun vrai partage en headless) ; le compte est factice (Firebase n'est pas joignable en preview).
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { DEBUG_URL, collectConsoleErrors, openGame } from './helpers';

const FIREBASE = /googleapis\.com|firebaseapp\.com|apis\.google\.com|gstatic\.com|\/__\//;
const UID_A = 'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9b';
const UID_B = 'Zz1Yy2Xx3Ww4Vv5Uu6Tt7Ss8Rr9q';
const today = (): string => new Date().toISOString().slice(0, 10);
const yesterday = (): string => new Date(Date.now() - 86400000).toISOString().slice(0, 10);

/** Partage natif espionné : le texte partagé est rangé dans `window.__shared`. */
async function spyShare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: string[] };
    w.__shared = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (d: { text: string }) => {
        w.__shared.push(d.text);
        return Promise.resolve();
      },
    });
  });
}

async function press(page: Page, sel: string, hasTouch: boolean): Promise<void> {
  if (hasTouch) await page.locator(sel).tap();
  else await page.locator(sel).click();
}

/**
 * Ouvre un lien de défi (mode debug, paramètres dans le fragment) et attend le jeu prêt ; `scene` faux : seulement le
 * module d'entrée (le lien est lu à son chargement), sans attendre la scène 3D. Passer par une page vide force un vrai
 * chargement : sinon, depuis le jeu, seul le fragment changerait.
 */
async function openLink(page: Page, params: string, scene = true): Promise<void> {
  await page.goto('about:blank');
  await page.goto(`${DEBUG_URL}#${params}`);
  if (scene) await page.waitForFunction(() => (window as any).__game?.ready === true);
  else await page.waitForFunction(() => (window as any).__game !== undefined);
}

/**
 * Attend que la méta soit écrite dans IndexedDB avant de recharger la page : au chargement, la méta durable remplace celle
 * du repli localStorage, et une écriture encore en route ferait revenir l'ancienne.
 */
async function persisted(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      new Promise<boolean>((done) => {
        const open = indexedDB.open('keyval-store');
        open.onerror = () => done(false);
        open.onsuccess = () => {
          const db = open.result;
          const get = db.transaction('keyval', 'readonly').objectStore('keyval').get('ruee-meta');
          get.onerror = () => done(false);
          get.onsuccess = () => {
            db.close();
            done(JSON.stringify(get.result) === JSON.stringify((window as any).__game.meta));
          };
        };
      }),
  );
}

/** Défi du jour lancé depuis sa feuille, quelques secondes de jeu, puis la mort : écran de fin. */
async function dailyOver(page: Page): Promise<void> {
  await startDaily(page);
  await endRun(page);
}
/** Défi du jour lancé depuis le menu (bouton débloqué par le succès « survie3 », comme dans e2e/daily.spec.ts). */
async function startDaily(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    if (!g.meta.achievements.includes('survie3'))
      g.setMeta({ ...g.meta, achievements: [...g.meta.achievements, 'survie3'] });
  });
  await page.locator('#dailyBtn').click();
  await page.locator('#dailyPlayBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
}
async function endRun(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.warp(20);
    g.debug.kill();
  });
  await expect(page.locator('#over')).toBeVisible({ timeout: 8000 });
}

test('The result card reveals nothing about the run', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await spyShare(page);
  await openGame(page);
  // série de 3 jusqu'à hier : le défi d'aujourd'hui la porte à 4
  await page.evaluate((last) => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, streak: { last, count: 3, best: 3, jokerWeek: '' } });
  }, yesterday());
  await dailyOver(page);
  await expect(page.locator('#shareBtn')).toBeVisible();
  await page.screenshot({ path: `shots/${info.project.name}-l4-fin-du-defi.png` });
  await page.locator('#shareBtn').click();
  await page.waitForFunction(() => (window as any).__shared.length === 1);
  const text: string = await page.evaluate(() => (window as any).__shared[0]);
  const kills: number = await page.evaluate(() => (window as any).__game.world.kills);
  const lines = text.split('\n');
  expect(lines[0]).toMatch(/^Swarmageddon · Défi du \d{1,2} [a-zéû]+\.?$/);
  expect(lines[1]).toBe(`⏱ 0:20 ❌  💀 ${kills}`);
  expect(lines[2]).toBe('🔥 Série : 4 jours');
  const origin = new URL(page.url()).origin;
  expect(lines[3]).toBe(`Bats-moi : ${origin}/#defi=${today()}&t=20&k=${kills}`);
  expect(lines).toHaveLength(4);
  // ni arme, ni objet, ni personnage
  expect(text).not.toMatch(/Orbe|Éclaireuse|eclaireuse|orbe|Tome/);
  expect(errors).toEqual([]);
});

test('Without native share the result is copied', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await page.addInitScript(() => {
    const w = window as unknown as { __copied: string[] };
    w.__copied = [];
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (s: string) => {
          w.__copied.push(s);
          return Promise.resolve();
        },
      },
    });
  });
  await openGame(page);
  await dailyOver(page);
  await page.locator('#shareBtn').click();
  await expect(page.locator('#shareMsg')).toHaveText('Copié !');
  const copied: string[] = await page.evaluate(() => (window as any).__copied);
  expect(copied).toHaveLength(1);
  expect(copied[0]).toContain('Bats-moi : ');
  await page.screenshot({ path: `shots/${info.project.name}-l4-copie.png` });
  // ni partage ni presse-papiers : le texte s'affiche, sélectionné, à copier à la main
  await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }));
  await page.locator('#shareBtn').click();
  await expect(page.locator('#shareText')).toBeVisible();
  await expect(page.locator('#shareText')).toHaveValue(/Bats-moi : /);
  expect(errors).toEqual([]);
});

test('A challenge sent to a friend opens the same run', async ({ page, hasTouch }, info) => {
  const errors = collectConsoleErrors(page);
  await openLink(page, `defi=${today()}&t=300&k=412&n=Jimmy`);
  const sheet = page.locator('#challenge');
  await expect(sheet).toBeVisible();
  await expect(page.locator('#challengeTitle')).toHaveText('Défi de Jimmy');
  await expect(page.locator('#challengeScore')).toHaveText('5:00 · 412 kills — à toi !');
  await expect(page.locator('#challengePlayBtn')).toBeFocused();
  // le lien est lu, puis son fragment retiré de l'adresse
  expect(new URL(page.url()).search).toBe('?debug=1');
  expect(new URL(page.url()).hash).toBe('');
  await page.screenshot({ path: `shots/${info.project.name}-l4-feuille-defi.png` });
  if (hasTouch) await page.locator('#challengePlayBtn').tap();
  else await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const friend = await page.evaluate(() => {
    const w = (window as any).__game.world;
    return { seed: w.seed, rng: w.rng.state(), dailyEnd: w.dailyEnd, weapons: Object.keys(w.weapons) };
  });
  expect(friend.dailyEnd).toBe(300);
  await expect(page.locator('#beatLbl')).toHaveText('À battre : 5:00 · 412');
  await page.screenshot({ path: `shots/${info.project.name}-l4-a-battre.png` });
  await endRun(page);
  await expect(page.locator('#oBeat')).toHaveText(/^Raté de \d:\d\d$/);
  // le défi du jour lancé depuis le menu : même carte, même hasard, même kit
  await page.locator('#menuBtn').click();
  await startDaily(page);
  const sender = await page.evaluate(() => {
    const w = (window as any).__game.world;
    return { seed: w.seed, rng: w.rng.state(), dailyEnd: w.dailyEnd, weapons: Object.keys(w.weapons) };
  });
  expect(sender).toEqual(friend);
  await expect(page.locator('#beatLbl')).toBeHidden(); // pas de score à battre hors du défi d'un ami
  expect(errors).toEqual([]);
});

test('A past day’s challenge does not count for the streak', async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  const before = { last: yesterday(), count: 3, best: 3, jokerWeek: '' };
  const daily = { date: today(), times: [100], kills: [10] };
  await page.evaluate(
    ([streak, d]) => (window as any).__game.setMeta({ ...(window as any).__game.meta, streak, daily: d }),
    [before, daily] as const,
  );
  await persisted(page);
  await openLink(page, `defi=${yesterday()}&t=10&k=1`);
  await expect(page.locator('#challenge')).toBeVisible();
  const fake = await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, pseudo: 'Moi' });
    (window as any).__fake = g.fakeAccount('moi', []);
    return true;
  });
  expect(fake).toBe(true);
  await page.locator('#challengePlayBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  expect(await page.evaluate(() => (window as any).__game.world.dailyEnd)).toBe(300);
  await endRun(page);
  await expect(page.locator('#oBeat')).toHaveText('Défi battu !');
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.streak).toEqual(before); // ni série…
  expect(meta.daily).toEqual(daily); // … ni classement du jour (local)
  await page.waitForFunction(() => (window as any).__fake.sent.length === 1);
  const sent = await page.evaluate(() => (window as any).__fake.sent[0]);
  expect(sent.day).toBeUndefined(); // … ni classement du jour entre amis
  expect(errors).toEqual([]);
});

test('An invalid link opens the normal menu', async ({ page }) => {
  test.slow(); // six chargements de page
  const errors = collectConsoleErrors(page);
  for (const params of [
    `defi=2026-13-45&t=10&k=1`,
    `defi=${today()}&t=abc&k=1`,
    `defi=${today()}&t=10&k=99999999`,
    `defi=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E&t=10&k=1`,
    `defi=2999-01-01&t=10&k=1`,
  ]) {
    await openLink(page, params, false);
    expect(await page.evaluate(() => (window as any).__game.app), params).toBe('menu');
    await expect(page.locator('#challenge'), params).toBeHidden();
    await expect(page.locator('#menu'), params).toBeVisible();
  }
  // un pseudo piégé s'affiche en texte, jamais en HTML
  await openLink(page, `defi=${today()}&t=10&k=1&n=%3Cb%3EZo%C3%A9%3C%2Fb%3E`, false);
  await expect(page.locator('#challengeTitle')).toHaveText('Défi de bZoéb');
  expect(await page.locator('#challenge b').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('Opening a link without an account sends no request', async ({ page }) => {
  const hits: string[] = [];
  page.on('request', (r) => {
    if (FIREBASE.test(r.url())) hits.push(r.url());
  });
  const errors = collectConsoleErrors(page);
  await spyShare(page);
  await openLink(page, `defi=${today()}&t=120&k=40&n=Jimmy&u=${UID_A}`);
  await page.locator('#challengePlayBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await endRun(page);
  await page.locator('#shareBtn').click();
  await page.waitForFunction(() => (window as any).__shared.length === 1);
  // sans pseudo ni compte : le lien ne porte ni nom ni identifiant
  expect(await page.evaluate(() => (window as any).__shared[0])).not.toMatch(/[?&][nu]=/);
  await page.locator('#menuBtn').click();
  await page.locator('#boardBtn').click();
  await page.locator('#boardFriends').click();
  await expect(page.locator('#boardInviteText')).toHaveText('Connecte-toi pour voir tes amis');
  expect(hits).toEqual([]);
  expect(errors).toEqual([]);
});

test('A link from a signed-in friend adds them to friends', async ({ page, hasTouch }) => {
  const errors = collectConsoleErrors(page);
  const link = `defi=${today()}&t=120&k=40&n=Jimmy&u=${UID_A}`;
  await openLink(page, link);
  await expect(page.locator('#challengeTitle')).toHaveText('Défi de Jimmy');
  // la feuille se ferme : Échap au clavier, la croix au doigt ; retour au menu
  if (hasTouch) await page.locator('#challengeBackBtn').tap();
  else await page.keyboard.press('Escape');
  await expect(page.locator('#challenge')).toBeHidden();
  await expect(page.locator('#menu')).toBeVisible();
  expect(await page.evaluate(() => (window as any).__game.app)).toBe('menu');
  await openLink(page, link); // le même lien rouvert : toujours un seul ami
  const friends = await page.evaluate(() => (window as any).__game.meta.friends);
  expect(friends).toEqual([{ uid: UID_A, name: 'Jimmy' }]);
  // la feuille en anglais
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, lang: 'en' } });
  });
  await persisted(page);
  await openLink(page, link);
  await expect(page.locator('#challengeTitle')).toHaveText("Jimmy's challenge");
  await expect(page.locator('#challengeScore')).toHaveText('2:00 · 40 kills — your turn!');
  await expect(page.locator('#challengePlayBtn')).toHaveText('Take the challenge');
  expect(await page.evaluate(() => (window as any).__game.meta.friends.length)).toBe(1);
  expect(errors).toEqual([]);
});

test('The daily board shows you and your friends', async ({ page, hasTouch }, info) => {
  const errors = collectConsoleErrors(page);
  await openGame(page);
  await page.evaluate(
    ([a, b]) => {
      const g = (window as any).__game;
      g.setMeta({
        ...g.meta,
        pseudo: 'Moi',
        friends: [
          { uid: a, name: 'Jimmy' },
          { uid: b, name: 'Zoé' },
        ],
      });
      g.fakeAccount('moi', [], {
        day: [
          { uid: 'moi', name: 'Moi', time: 300, kills: 380 },
          { uid: a, name: 'Jimmy', time: 300, kills: 412 },
          { uid: b, name: 'Zoé', time: 221, kills: 900 },
          { uid: 'inconnu', name: 'Pas ami', time: 300, kills: 999 },
        ],
      });
    },
    [UID_A, UID_B],
  );
  await press(page, '#boardBtn', hasTouch);
  await press(page, '#boardFriends', hasTouch);
  await expect(page.locator('#boardFriends')).toHaveClass(/selected/);
  const rows = page.locator('#boardList .brow');
  await expect(rows).toHaveCount(3);
  await expect(rows.locator('.name')).toHaveText(['Jimmy', 'Moi', 'Zoé']);
  await expect(rows.locator('.val')).toHaveText(['5:00 · 412', '5:00 · 380', '3:41 · 900']);
  await expect(page.locator('#boardList .brow.me .name')).toHaveText('Moi');
  await expect(page.locator('#boardTabs')).toBeHidden();
  await page.screenshot({ path: `shots/${info.project.name}-l4-classement-amis.png` });
  // retirer un ami depuis le classement : au doigt, ou Entrée sur le bouton au clavier
  const remove = page.locator(`#boardList [data-remove="${UID_B}"]`);
  if (hasTouch) await remove.tap();
  else {
    await remove.focus();
    await page.keyboard.press('Enter');
  }
  await expect(rows).toHaveCount(2);
  expect(await page.evaluate(() => (window as any).__game.meta.friends.length)).toBe(1);
  expect(errors).toEqual([]);
});

test('Sharing works by keyboard as by touch', async ({ page, hasTouch }) => {
  const errors = collectConsoleErrors(page);
  await spyShare(page);
  await openGame(page);
  await dailyOver(page);
  if (hasTouch) await page.locator('#shareBtn').tap();
  else {
    await page.locator('#shareBtn').focus();
    await page.keyboard.press('Enter');
  }
  await page.waitForFunction(() => (window as any).__shared.length === 1);
  expect(await page.evaluate(() => (window as any).__game.app)).toBe('over'); // Entrée n'a pas relancé de partie
  expect(errors).toEqual([]);
});
