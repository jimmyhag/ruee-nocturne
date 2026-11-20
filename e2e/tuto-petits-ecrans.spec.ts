// Consignes de la partie guidée lisibles sur les petits téléphones (docs/specs/tuto-petits-ecrans.md, 1.69.1) : un test
// par scénario, au titre anglais du scénario. Chaque test pose ses tailles de fenêtre (`setViewportSize` : les gabarits
// sont des requêtes média, ils suivent la fenêtre sans recharger), au doigt dans les deux projets (`hasTouch`,
// `isMobile` : les boutons tactiles sont à l'écran), et au clavier sur PC (règle 4 : les touches s'écrivent plus long).
// Tout se juge aux rectangles englobants. Avec CAPTURES=1 (ou
// CAPTURES=avant), les captures vont dans docs/captures/tuto-petits-ecrans/.
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ hasTouch: true, isMobile: true });

const FR = JSON.parse(readFileSync(new URL('../src/i18n/fr.json', import.meta.url), 'utf8')) as Record<string, string>;
/** La consigne la plus longue que la bulle peut afficher en français (étapes, premières apparitions, totem). */
const LONGEST = Object.entries(FR)
  .filter(([k]) => /^tuto\.(step|hint)\./.test(k) || k === 'tuto.force' || k === 'tuto.totemWait')
  .map(([, v]) => v)
  .reduce((a, b) => (b.length > a.length ? b : a));

const TUTO_URL = '/?debug=1&tuto=1&help=1';
const S = { move: 0, slideJump: 6, bossTotem: 12 } as const;
const LANDSCAPE = [
  { width: 568, height: 320 }, // iPhone SE de première génération
  { width: 640, height: 360 }, // petit Android
  { width: 667, height: 375 }, // iPhone 8
  { width: 932, height: 430 }, // grand Android, iPhone Pro Max : la minicarte de 140 px
];
const PORTRAIT = { width: 320, height: 568 };
const SHOTS = process.env.CAPTURES === '1' ? 'apres' : process.env.CAPTURES;

type Box = { left: number; top: number; right: number; bottom: number };

/** Nouveau joueur, page fraîche, « Jouer » au doigt (ou à la souris) : la partie guidée, héros increvable, sans horde ni feuille. */
async function guided(page: Page, touch = true): Promise<void> {
  await page.goto(TUTO_URL);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 5 }));
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  const btn = (await page.locator('#help').isVisible()) ? '#helpPlayBtn' : '#playBtn';
  if (touch) await page.locator(btn).tap();
  else await page.locator(btn).click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.evaluate(() => {
    const G = (window as any).__game,
      w = G.world;
    w.player.invul = 1e9;
    w.player.need = 1e9;
    w.powerNext = w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.merchant.next = 99;
    w.enemyCount = 0;
    G.guide.elite = w.nextElite; // pas de fausse consigne « élite » (le guide suit nextElite)
  });
}
async function jumpTo(page: Page, step: number): Promise<void> {
  await page.evaluate((n) => (window as any).__game.guideStep(n), step);
  await page.waitForFunction((n) => (window as any).__game.guide.step === n, step);
  await page.waitForTimeout(300); // la bulle est réécrite à l'image suivante, la flèche après le rendu
  await steady(page);
}
/**
 * La caméra a rejoint le héros (une étape sautée ou un téléport le déplacent d'un coup ; sous SwiftShader chargé, la
 * caméra met plus d'une seconde à suivre) : ses pieds sont au centre de l'écran, à 10 % près.
 */
async function steady(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const G = (window as any).__game,
      cam = G.scene.camera,
      p = G.world.player;
    const v = cam.position.clone().set(p.x, G.world.heightAt(p.x, p.z), p.z).project(cam);
    return Math.abs(v.x) < 0.1 && Math.abs(v.y) < 0.2;
  });
}
/** La consigne la plus longue dans la bulle, sans commande (une consigne de première apparition n'en a pas). */
async function showLongest(page: Page): Promise<void> {
  await page.evaluate((s) => {
    document.getElementById('tutoCmd')!.textContent = '';
    document.getElementById('tutoText')!.textContent = s;
  }, LONGEST);
  await settle(page);
}
/**
 * La bulle a pris sa nouvelle taille et la flèche s'est replacée : la vue relit la place de la bulle 4 fois par seconde
 * quand le texte ne passe pas par elle (ici, écrit directement), puis deux images.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForTimeout(300);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Rectangles de ce que la bulle ne doit pas recouvrir, et ce qu'il faut savoir de la bulle elle-même. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const rect = (e: Element): { left: number; top: number; right: number; bottom: number } | null => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? { left: r.left, top: r.top, right: r.right, bottom: r.bottom } : null;
    };
    const all = (sel: string) =>
      [...document.querySelectorAll(sel)].flatMap((e) => {
        const r = rect(e);
        return r ? [{ sel: e.id ? '#' + e.id : sel, ...r }] : [];
      });
    const G = (window as any).__game,
      cam = G.scene.camera,
      p = G.world.player;
    // le héros à l'écran : des pieds à la tête (1,8 u), 16 px de part et d'autre
    const at = (y: number) => {
      const v = cam.position.clone().set(p.x, y, p.z).project(cam);
      return { x: ((v.x + 1) / 2) * innerWidth, y: ((1 - v.y) / 2) * innerHeight };
    };
    const gy = G.world.heightAt(p.x, p.z),
      feet = at(gy),
      head = at(gy + 1.8);
    const tuto = document.getElementById('tuto')!;
    const arrow = document.getElementById('tutoArrow')!;
    return {
      bubble: rect(tuto),
      fontSize: parseFloat(getComputedStyle(document.getElementById('tutoText')!).fontSize),
      scroll: { sw: tuto.scrollWidth, cw: tuto.clientWidth, sh: tuto.scrollHeight, ch: tuto.clientHeight },
      text: tuto.textContent,
      arrow: arrow.hidden ? null : rect(arrow),
      hero: { left: head.x - 16, right: head.x + 16, top: head.y - 4, bottom: feet.y + 4 },
      center: { x: innerWidth / 2, y: innerHeight / 2 },
      hud: [
        ...all('#minimap'),
        ...all('.tbtns button'),
        ...all('.hleft > *'), // le bloc de gauche : chacune de ses lignes (PV, difficulté, intensité, kit…)
        ...all('#timeBox'),
        ...all('#goalChip'),
        ...all('#merchantChip'),
        ...all('#bossbar'),
        ...all('#keys > *'), // les rappels de touches (clavier)
        ...all('#gear > *'), // l'équipement, en bas
      ],
    };
  });
}
const overlap = (a: Box, b: Box): boolean =>
  a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

/** La bulle est dans l'écran, son texte entier, en 14 px au moins, et elle ne recouvre rien de ce qui compte. */
async function expectReadable(page: Page, what: string, hero: boolean): Promise<void> {
  const vp = page.viewportSize()!;
  const at = `${what} à ${vp.width}×${vp.height}`;
  await expect(page.locator('#tuto'), at).toBeVisible();
  const L = await layout(page);
  const b = L.bubble!;
  expect(b, at).not.toBeNull();
  expect(b.left, `${at} : la bulle sort à gauche`).toBeGreaterThanOrEqual(0);
  expect(b.top, `${at} : la bulle sort en haut`).toBeGreaterThanOrEqual(0);
  expect(b.right, `${at} : la bulle sort à droite`).toBeLessThanOrEqual(vp.width);
  expect(b.bottom, `${at} : la bulle sort en bas`).toBeLessThanOrEqual(vp.height);
  expect(L.scroll.sh, `${at} : texte coupé en hauteur`).toBeLessThanOrEqual(L.scroll.ch);
  expect(L.scroll.sw, `${at} : texte coupé en largeur`).toBeLessThanOrEqual(L.scroll.cw);
  expect(L.fontSize, `${at} : police`).toBeGreaterThanOrEqual(14);
  if (hero) {
    const c = L.center;
    const onCenter = c.x > b.left && c.x < b.right && c.y > b.top && c.y < b.bottom;
    expect(onCenter, `${at} : la bulle couvre le centre de l'écran`).toBe(false);
    expect(overlap(b, L.hero), `${at} : la bulle ${JSON.stringify(b)} couvre le héros ${JSON.stringify(L.hero)}`).toBe(
      false,
    );
  }
  for (const h of L.hud) expect(overlap(b, h), `${at} : la bulle recouvre ${h.sel}`).toBe(false);
  // décision 4 : la flèche reste dans l'écran et ne passe pas sous la bulle
  if (L.arrow) {
    const a = L.arrow;
    expect(
      a.left >= 0 && a.top >= 0 && a.right <= vp.width && a.bottom <= vp.height,
      `${at} : flèche hors de l'écran`,
    ).toBe(true);
    expect(overlap(b, a), `${at} : la flèche ${JSON.stringify(a)} est sous la bulle ${JSON.stringify(b)}`).toBe(false);
  }
}
/** Le joueur à `d` u au sud du lieu montré : le lieu est à l'écran, juste au-dessus du héros (flèche posée dessus). */
async function nearPlace(page: Page, d: number): Promise<void> {
  await page.evaluate((dz) => {
    const G = (window as any).__game,
      w = G.world;
    const p = w.bossTotems[G.guide.target];
    G.debug.teleport(p.x, p.z + dz);
  }, d);
  await steady(page); // la caméra rejoint le héros
  await page.waitForTimeout(300); // la flèche suit
}
async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  const vp = page.viewportSize()!;
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true)); // l'onglet perf du debug
  await page.screenshot({
    path: `docs/captures/tuto-petits-ecrans/${SHOTS}-${vp.width}x${vp.height}-${name}.jpg`,
    type: 'jpeg',
    quality: 70,
    scale: 'css', // la taille de l'écran, pas ses pixels physiques (iPhone 13 : ×3)
  });
}

test('The prompt does not hide the hero on a small landscape phone', async ({ page }) => {
  test.setTimeout(240_000); // quatre tailles, sept consignes chacune, sous SwiftShader
  await page.setViewportSize(LANDSCAPE[0]);
  await guided(page);
  for (const vp of LANDSCAPE) {
    await page.setViewportSize(vp);
    await jumpTo(page, S.slideJump); // la plus longue avec une commande (« GLISSE + SAUT »)
    await expectReadable(page, 'glisse puis saute', true);
    await jumpTo(page, S.bossTotem); // l'étape la plus longue, avec sa flèche
    await expectReadable(page, 'totem de boss', true);
    for (const d of [2, 3.5, 5]) {
      await nearPlace(page, d);
      await expectReadable(page, `totem de boss à ${d} u`, true);
    }
    await shot(page, 'consigne');
    await showLongest(page);
    await expectReadable(page, 'consigne la plus longue', true);
    await shot(page, 'plus-longue');
  }
  // 8:00 : « Va activer la statue rouge » ; d'abord sans boss de survie, sous la puce d'objectif et celle du marchand
  await page.evaluate(() => {
    const G = (window as any).__game,
      w = G.world,
      M = w.merchant;
    w.survivalNext = 99; // pas de boss de survie (7:00) : pas de barre de boss
    G.debug.stageTime(481);
    Object.assign(M, { active: true, inside: false, x: w.player.x + 20, z: w.player.z, until: 1e9 });
  });
  await expect(page.locator('#goalChip')).toBeVisible();
  await expect(page.locator('#merchantChip')).toBeVisible();
  await expect(page.locator('#bossbar')).toBeHidden();
  for (const vp of LANDSCAPE) {
    await page.setViewportSize(vp);
    await settle(page);
    await expect(page.locator('#tutoText')).toHaveText(FR['tuto.force']);
    await expectReadable(page, 'statue rouge sous les deux puces', true);
    await showLongest(page);
    await expectReadable(page, 'consigne la plus longue sous les deux puces', true);
    await jumpTo(page, S.bossTotem); // la bulle reprend la consigne obligatoire
  }
  // puis le boss de survie de 7:00 : la barre de boss et la puce d'objectif, l'écran le plus chargé
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    w.merchant.active = false;
    w.survivalNext = 1;
  });
  await expect(page.locator('#bossbar')).toBeVisible();
  await expect(page.locator('#goalChip')).toBeVisible();
  for (const vp of LANDSCAPE) {
    await page.setViewportSize(vp);
    await settle(page);
    await expect(page.locator('#tutoText')).toHaveText(FR['tuto.force']);
    await expectReadable(page, 'statue rouge', true);
    await shot(page, 'boss');
    await showLongest(page);
    await expectReadable(page, 'consigne la plus longue sous la barre de boss', true);
    await jumpTo(page, S.bossTotem);
  }
  // Gaucher : les boutons tactiles passent en bas à gauche, là où la bulle se range pendant le boss
  await page.setViewportSize(LANDSCAPE[0]);
  await page.evaluate(() => document.body.classList.add('lefty'));
  await settle(page);
  await expectReadable(page, 'statue rouge, gaucher', true);
  await showLongest(page);
  await expectReadable(page, 'consigne la plus longue sous la barre de boss, gaucher', true);
  await shot(page, 'boss-gaucher');
});

test.describe('keyboard', () => {
  test.use({ hasTouch: false, isMobile: false });
  // règle 4 : au clavier, la commande est la touche des réglages (« ZQSD », « C + Espace »), plus longue qu'au doigt
  test('The prompt does not hide the hero on a small landscape phone', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'clavier : projet PC');
    await page.setViewportSize(LANDSCAPE[0]);
    await guided(page, false);
    for (const [step, cmd, what] of [
      [S.move, 'ZQSD', 'déplace-toi'],
      [S.slideJump, 'C + Espace', 'glisse puis saute'],
    ] as const) {
      await jumpTo(page, step);
      await expect(page.locator('#tutoCmd')).toHaveText(cmd);
      await expect(page.locator('#keys')).toBeVisible();
      await expectReadable(page, `${what} au clavier`, true);
    }
  });
});

test('The prompt stays readable on a narrow portrait screen', async ({ page }) => {
  await page.setViewportSize(PORTRAIT);
  await guided(page);
  await jumpTo(page, S.slideJump);
  await expectReadable(page, 'glisse puis saute', false);
  await jumpTo(page, S.bossTotem);
  await expectReadable(page, 'totem de boss', false);
  await shot(page, 'consigne');
  await showLongest(page);
  await expectReadable(page, 'consigne la plus longue', false);
  await shot(page, 'plus-longue');
  await page.evaluate(() => (window as any).__game.debug.stageTime(481));
  await expect(page.locator('#bossbar')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.locator('#tutoText')).toHaveText(FR['tuto.force']);
  await expectReadable(page, 'statue rouge', false);
  await shot(page, 'boss');
});

/** Le bouton (ou le nom d'une carte) est tout entier dans l'écran, sans défiler, et on le touche en son milieu. */
async function expectTouchable(page: Page, sel: string): Promise<{ x: number; y: number }> {
  const vp = page.viewportSize()!;
  const r = await page.evaluate((s) => {
    const el = document.querySelector(s)!;
    const b = el.getBoundingClientRect();
    const x = b.left + b.width / 2,
      y = b.top + b.height / 2;
    const hit = document.elementFromPoint(x, y),
      btn = el.closest('button') ?? el; // le nom d'une carte : la carte entière est le bouton
    return {
      left: b.left,
      top: b.top,
      right: b.right,
      bottom: b.bottom,
      x,
      y,
      mine: !!hit && btn.contains(hit),
      hit: hit ? hit.tagName + '#' + hit.id + '.' + hit.className : '',
    };
  }, sel);
  const at = `${sel} à ${vp.width}×${vp.height}`;
  expect(r.left, `${at} : sort à gauche`).toBeGreaterThanOrEqual(0);
  expect(r.top, `${at} : sort en haut`).toBeGreaterThanOrEqual(0);
  expect(r.right, `${at} : sort à droite`).toBeLessThanOrEqual(vp.width);
  expect(r.bottom, `${at} : sort en bas`).toBeLessThanOrEqual(vp.height);
  expect(r.mine, `${at} : ${r.hit} par-dessus`).toBe(true);
  return { x: r.x, y: r.y };
}

test('The guided run windows fit a small screen', async ({ page }) => {
  test.setTimeout(120_000); // le boss du totem à abattre sous SwiftShader
  await page.setViewportSize(LANDSCAPE[0]);
  await guided(page);
  // l'explication des raretés : la carte à prendre (le tome imposé, la première) est dans l'écran
  await page.evaluate(() => (window as any).__game.debug.levelUp());
  await page.waitForFunction(() => (window as any).__game.app === 'levelup');
  await expect(page.locator('#luTuto')).toBeVisible();
  await page.waitForTimeout(600); // fin de l'entrée en cascade des cartes
  await shot(page, 'cartes');
  let p = await expectTouchable(page, '#cards .card:first-child h3');
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.evaluate(() => ((window as any).__game.world.player.need = 1e9));
  // la fenêtre du portail : le totem activé, son boss abattu
  await page.evaluate(() => {
    const G = (window as any).__game;
    G.debug.stageTime(481);
    const T = G.world.totem;
    G.debug.teleport(T.x, T.z);
    T.charge = 2.9;
  });
  await page.waitForFunction(() => (window as any).__game.world.totem.state === 1);
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    const b = w.enemies[w.bossIndex];
    b.hp = 1;
    b.x = b.px = w.player.x + 3;
    b.z = b.pz = w.player.z;
  });
  await expect(page.locator('#info')).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#infoTitle')).toHaveText(FR['win.portal.title']);
  await shot(page, 'portail');
  p = await expectTouchable(page, '#infoOk');
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  // la fin de la partie guidée (victoire : le boss du totem est tombé)
  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#tutoEnd')).toBeVisible({ timeout: 8000 });
  await shot(page, 'fin');
  await expectTouchable(page, '#teMenuBtn');
  p = await expectTouchable(page, '#tePlayBtn');
  await page.touchscreen.tap(p.x, p.y);
  await page.waitForFunction(() => (window as any).__game.app === 'play');
});
