// Partie guidée (docs/specs/tutoriel.md) : l'interface, sur PC (clavier) et sur téléphone (doigt), un test par scénario
// d'interface (titres en anglais). La simulation et la méta sont dans src/meta/tutorial.test.ts. Les captures de chaque
// étape du guide (téléphone) vont dans docs/captures/tutoriel/ quand CAPTURES=1.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame } from './helpers';

/** Avec `tuto=1`, « Jouer » lance la partie guidée d'un nouveau joueur même sous ?debug (comme help=1 pour l'aide). */
const TUTO_URL = '/?debug=1&tuto=1&help=1';
const S = {
  move: 0,
  fire: 1,
  cards: 3,
  jump: 4,
  slide: 5,
  slideJump: 6,
  spell: 7,
  chest: 8,
  shrine: 9,
  skull: 11,
  bossTotem: 12,
  totem: 13,
} as const;
const PLACES = ['chest', 'shrine', 'race', 'skull', 'bossTotem', 'totem'] as const;

const g = (page: Page) => page.evaluate(() => (window as any).__game.guide?.step as number | undefined);
const app = (page: Page) => page.evaluate(() => (window as any).__game.app as string);

/** Nouveau joueur, page fraîche : profil vierge, rechargé pour que le premier lancement soit le sien. */
async function newPlayer(page: Page): Promise<void> {
  await page.goto(TUTO_URL);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 5 }));
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
}
/** « Jouer », au doigt ou à la souris : celui de l'aide du premier lancement (1.65.1) s'il est ouvert, sinon du menu. */
async function play(page: Page, hasTouch: boolean): Promise<void> {
  const btn = (await page.locator('#help').isVisible()) ? '#helpPlayBtn' : '#playBtn';
  if (hasTouch) await page.locator(btn).tap();
  else await page.locator(btn).click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
}
/** La partie guidée en cours, héros increvable (les gestes se testent sans mourir sous SwiftShader). */
async function guided(page: Page, hasTouch: boolean): Promise<void> {
  await newPlayer(page);
  await play(page, hasTouch);
  // invulnérable (pas de PV géants à l'écran : les captures montrent le HUD d'une vraie partie)
  await page.evaluate(() => ((window as any).__game.world.player.invul = 1e9));
}
/** Horde retirée et plus de montée de niveau : les lieux se testent sans feuille qui mette la partie en pause. */
async function calm(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    w.player.need = 1e9;
    w.powerNext = w.nextWave = w.nextElite = w.nextEruption = 1e9;
    w.merchant.next = 99;
    w.enemyCount = 0;
    (window as any).__game.guide.elite = w.nextElite; // pas de fausse consigne « élite » (le guide suit nextElite)
  });
}
async function jumpTo(page: Page, step: number): Promise<void> {
  await page.evaluate((n) => (window as any).__game.guideStep(n), step);
  await page.waitForFunction((n) => (window as any).__game.guide.step === n, step);
}
/** La feuille de niveau ouverte : prend la première carte (la seule permise si un tome est imposé), au doigt ou au clavier. */
async function takeFirst(page: Page, hasTouch: boolean): Promise<void> {
  if (hasTouch) await page.locator('#cards .card').first().tap();
  else await page.keyboard.press('Digit1');
}
/** Joue jusqu'à `done`, en prenant la première carte des feuilles qui s'ouvrent en route (coffre du boss, niveaux). */
async function playUntil(page: Page, hasTouch: boolean, done: () => Promise<boolean>): Promise<void> {
  for (let i = 0; i < 120 && !(await done()); i++) {
    if ((await app(page)) === 'levelup') await takeFirst(page, hasTouch);
    await page.waitForTimeout(250);
  }
  expect(await done()).toBe(true);
}
async function shot(page: Page, name: string, hasTouch: boolean): Promise<void> {
  if (process.env.CAPTURES !== '1' || !hasTouch) return;
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true)); // l'onglet perf du debug
  await page.screenshot({ path: `docs/captures/tutoriel/${name}.jpg`, type: 'jpeg', quality: 70 });
}
/** Joystick tenu vers la droite (protocole Chrome : vrais événements tactiles), relâché quand `held` se termine. */
async function stick(page: Page, held: () => Promise<unknown>): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  const vp = page.viewportSize()!;
  const x0 = Math.round(vp.width * 0.25),
    y0 = Math.round(vp.height * 0.6);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0, id: 1 }] });
  for (let i = 1; i <= 6; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + i * 10, y: y0, id: 1 }] });
    await page.waitForTimeout(30);
  }
  await held();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test('A new player starts with the guided run', async ({ page, hasTouch }) => {
  const errors = collectConsoleErrors(page);
  await newPlayer(page);
  // 1.65.1 (retour de Jimmy) : au premier lancement, l'aide montre les touches ; « Jouer » est la seule sortie
  await expect(page.locator('#help')).toBeVisible();
  await expect(page.locator('#helpPlayBtn')).toBeVisible();
  await expect(page.locator('#helpBackBtn')).toBeHidden();
  await expect(page.locator('#helpTutoBtn')).toBeHidden();
  await expect(page.locator('#tabBar')).toBeHidden(); // pas d'onglet pour en sortir
  if (!hasTouch) {
    await page.keyboard.press('Escape'); // Échap ne la ferme pas
    await expect(page.locator('#help')).toBeVisible();
  }
  await play(page, hasTouch);
  const w = await page.evaluate(() => {
    const x = (window as any).__game.world;
    return { tutorial: x.tutorial, stage: x.stage, weapons: Object.keys(x.weapons), reveal: x.reveal };
  });
  expect(w).toEqual({ tutorial: true, stage: 0, weapons: ['orbe'], reveal: 4 }); // monde 1, l'Éclaireuse
  expect(await g(page)).toBe(S.move);
  await expect(page.locator('#tuto')).toBeVisible();
  await expect(page.locator('#tutoText')).toHaveText('Déplace-toi');
  await expect(page.locator('#tuto')).toHaveAttribute('role', 'status'); // lue par les lecteurs d'écran
  await expect(page.locator('#help')).toBeHidden();
  // relancé en pleine partie guidée : l'aide obligatoire ne revient pas (la partie gardée attend au menu)
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#help')).toBeHidden();
  expect(errors).toEqual([]);
});

test('A new player starts the guided run with Enter too', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'clavier'); // règle 4 : le doigt passe par « Jouer » (test précédent)
  await newPlayer(page);
  // l'aide du premier lancement : « Jouer » a le focus, Entrée le presse
  await expect(page.locator('#helpPlayBtn')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  expect(await page.evaluate(() => (window as any).__game.world.tutorial)).toBe(true);
});

test('A new player who has seen the controls starts the guided run with Enter at the menu', async ({
  page,
  hasTouch,
}) => {
  test.skip(hasTouch, 'clavier'); // règle 4 : le doigt passe par « Jouer » du menu (« An existing player… » et suivants)
  await page.goto(TUTO_URL);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 5, seenHelp: true }));
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#help')).toBeHidden();
  await page.locator('body').focus(); // aucun bouton du menu n'a le focus, comme au chargement
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  expect(await page.evaluate(() => (window as any).__game.world.tutorial)).toBe(true);
});

test('An existing player never sees it', async ({ page, hasTouch }) => {
  await page.goto(TUTO_URL);
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => (window as any).__game.setMeta({ version: 5, runs: 4, reveal: 4, seenHelp: true }));
  await play(page, hasTouch);
  expect(await page.evaluate(() => (window as any).__game.world.tutorial)).toBe(false);
  await expect(page.locator('#tuto')).toBeHidden();
});

test('Each gesture waits for the player to do it', async ({ page, hasTouch }) => {
  test.setTimeout(120_000); // quatre gestes, chacun attendu en jeu sous SwiftShader
  await guided(page, hasTouch);
  // se déplacer : le joystick ou les touches, tenus jusqu'à ce que l'étape passe (SwiftShader : peu d'images par seconde)
  if (hasTouch) await stick(page, () => page.waitForFunction(() => (window as any).__game.guide.step > 0));
  else {
    await page.keyboard.down('KeyD');
    await page.waitForFunction(() => (window as any).__game.guide.step > 0);
    await page.keyboard.up('KeyD');
  }
  // le saut attend le saut : rien ne passe pendant qu'on attend (la sim tient 30 s : src/meta/tutorial.test.ts)
  await jumpTo(page, S.jump);
  await page.waitForFunction(() => (window as any).__game.tutoScale < 1); // l'onde, au ralenti
  await page.waitForTimeout(1500);
  expect(await g(page)).toBe(S.jump);
  await expect(page.locator('#tutoText')).toHaveText("Saute par-dessus l'onde");
  if (hasTouch) await page.locator('#btnJump').tap();
  else await page.keyboard.press('Space');
  await page.waitForFunction((n) => (window as any).__game.guide.step === n, S.slide);
  // glisser (en marchant : la glisse part dans la direction du mouvement)
  await page.waitForFunction(() => (window as any).__game.world.player.onGround); // retombé au sol (au ralenti)
  const slid = () => page.waitForFunction((n) => (window as any).__game.guide.step === n, S.slideJump);
  if (hasTouch)
    await stick(page, async () => {
      // second doigt sur GLISSE pendant que le premier tient le joystick
      const cdp = await page.context().newCDPSession(page);
      const b = (await page.locator('#btnSlide').boundingBox())!;
      const vp = page.viewportSize()!;
      const held = { x: Math.round(vp.width * 0.25) + 60, y: Math.round(vp.height * 0.6), id: 1 };
      const btn = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2), id: 2 };
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [held, btn] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [held] });
      await slid();
    });
  else {
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(200);
    await page.keyboard.down('KeyC');
    await slid();
    await page.keyboard.up('KeyC');
    await page.keyboard.up('KeyD');
  }
  // le sort de classe
  await jumpTo(page, S.spell);
  await page.waitForTimeout(300);
  if (hasTouch) await page.locator('#btnSpell').tap();
  else await page.keyboard.press('ShiftLeft');
  await page.waitForFunction((n) => (window as any).__game.guide.step === n, S.chest);
});

test('The prompts follow the device', async ({ page, hasTouch }) => {
  if (process.env.CAPTURES === '1') test.setTimeout(180_000); // treize captures d'étapes en plus
  await guided(page, hasTouch);
  // chaque consigne de geste montre le bouton à toucher, ou la touche des réglages de touches
  const want = hasTouch
    ? { [S.move]: 'Joystick', [S.jump]: 'SAUT', [S.slide]: 'GLISSE', [S.slideJump]: 'GLISSE + SAUT' }
    : { [S.move]: 'ZQSD', [S.jump]: 'Espace', [S.slide]: 'C', [S.slideJump]: 'C + Espace' };
  for (const [step, cmd] of Object.entries(want)) {
    await jumpTo(page, +step);
    await expect(page.locator('#tutoCmd')).toHaveText(cmd);
  }
  // au doigt, le bouton du geste est mis en valeur
  await jumpTo(page, S.jump);
  if (hasTouch) await expect(page.locator('#btnJump')).toHaveClass(/tuto-hl/);
  await jumpTo(page, S.spell);
  await expect(page.locator('#tutoCmd')).not.toBeEmpty();
  if (hasTouch) await expect(page.locator('#btnSpell')).toHaveClass(/tuto-hl/);
  // une étape sans geste n'a pas de commande
  await jumpTo(page, S.fire);
  await expect(page.locator('#tutoCmd')).toBeEmpty();
  await expect(page.locator('#tutoText')).toContainText('tire tout seul');
  // captures de chaque étape du guide (téléphone, CAPTURES=1) ; la feuille de niveau a la sienne
  if (process.env.CAPTURES === '1' && hasTouch) await calm(page); // aucune feuille de niveau dans les captures d'étapes
  if (process.env.CAPTURES === '1' && hasTouch)
    for (let n = 0; n <= 13; n++) {
      if (n === S.cards) continue;
      await jumpTo(page, n);
      await page.waitForTimeout(600);
      const key = await page.evaluate(() => {
        const st = (window as any).__game.guide.step as number;
        return [
          'move',
          'fire',
          'gems',
          'cards',
          'jump',
          'slide',
          'slideJump',
          'spell',
          'chest',
          'shrine',
          'race',
          'skull',
          'bossTotem',
          'totem',
        ][st];
      });
      await shot(page, `etape-${String(n).padStart(2, '0')}-${key}`, hasTouch);
    }
});

test('The first level-up card explains the rarities', async ({ page, hasTouch }) => {
  await guided(page, hasTouch);
  await page.evaluate(() => (window as any).__game.debug.levelUp());
  await page.waitForFunction(() => (window as any).__game.app === 'levelup'); // la feuille met la partie en pause
  await expect(page.locator('#luTuto')).toBeVisible();
  await expect(page.locator('#luTuto li')).toHaveCount(3);
  await expect(page.locator('#luTuto')).toContainText('Arme');
  await expect(page.locator('#luTuto')).toContainText('Tome');
  await expect(page.locator('#luTuto .rar')).toHaveText(['Commune', 'Rare', 'Épique']);
  expect(await page.locator('#cards .card.rare, #cards .card.epic').count()).toBeGreaterThan(0);
  await page.waitForTimeout(600); // fin de l'entrée en cascade des cartes
  await shot(page, 'feuille-cartes', hasTouch);
  // le joueur choisit lui-même
  if (hasTouch) await page.locator('#cards .card').first().tap();
  else await page.keyboard.press('Digit1');
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  expect(await page.evaluate(() => (window as any).__game.guide.cards)).toBe(true);
  // les feuilles suivantes n'ont plus l'explication
  await page.evaluate(() => (window as any).__game.debug.levelUp());
  await page.waitForFunction(() => (window as any).__game.app === 'levelup');
  await expect(page.locator('#luTuto')).toBeHidden();
});

test('The first two tomes are imposed', async ({ page, hasTouch }) => {
  await guided(page, hasTouch);
  const tomes = () => page.evaluate(() => Object.keys((window as any).__game.world.tomes).sort() as string[]);
  for (const [key, name] of [
    ['degats', 'Prends le tome de Dégâts'],
    ['projectiles', 'Prends le tome de Projectiles'],
  ] as const) {
    await page.evaluate(() => (window as any).__game.debug.levelUp());
    await page.waitForFunction(() => (window as any).__game.app === 'levelup');
    // le tome imposé sur la première carte, mis en avant ; les autres visibles, éteintes, avec la consigne
    const first = await page.evaluate(() => (window as any).__game.world.cards[0]);
    expect([first.kind, first.key]).toEqual(['t', key]);
    await expect(page.locator('#luHint')).toHaveText(name);
    await expect(page.locator('#cards .card').first()).toHaveClass(/imposed/);
    const n = await page.locator('#cards .card').count();
    expect(n).toBeGreaterThan(1);
    await expect(page.locator('#cards .card.off')).toHaveCount(n - 1);
    await expect(page.locator('#luReroll')).toBeDisabled();
    if (key === 'degats') {
      await page.waitForTimeout(600); // fin de l'entrée en cascade des cartes
      await shot(page, 'feuille-tome-impose', hasTouch);
    }
    // une autre carte, au doigt ou au clavier : rien ne se passe
    const before = await tomes();
    if (hasTouch)
      await page.locator('#cards .card').nth(1).tap({ force: true }); // éteinte (aria-disabled), touchée quand même
    else await page.keyboard.press('Digit2');
    await page.waitForTimeout(400);
    expect(await app(page)).toBe('levelup');
    expect(await tomes()).toEqual(before);
    // le tome imposé : pris
    await takeFirst(page, hasTouch);
    await page.waitForFunction(() => (window as any).__game.app === 'play');
    expect(await tomes()).toContain(key);
  }
  // ensuite le choix est libre, sans autre tome
  await page.evaluate(() => (window as any).__game.debug.levelUp());
  await page.waitForFunction(() => (window as any).__game.app === 'levelup');
  await expect(page.locator('#cards .card.off')).toHaveCount(0);
  await expect(page.locator('#luHint')).toHaveText('Choisis une carte');
  const kinds = await page.evaluate(() =>
    ((window as any).__game.world.cards as { kind: string; key: string }[])
      .filter((c) => c.kind === 't')
      .map((c) => c.key),
  );
  for (const k of kinds) expect(['degats', 'projectiles']).toContain(k);
});

test('The map places are shown one by one', async ({ page, hasTouch }) => {
  await guided(page, hasTouch);
  const texts = ['coffre', 'sanctuaire', 'course', 'crâne', 'totem de boss', 'totem du monde'];
  for (let k = 0; k < PLACES.length; k++) {
    await jumpTo(page, S.chest + k);
    await expect(page.locator('#tutoText')).toContainText(texts[k]);
    await expect(page.locator('#tutoArrow')).toBeVisible(); // une flèche vers le lieu
    const near = await page.evaluate(() => {
      const G = (window as any).__game;
      const w = G.world,
        st = G.guide;
      const list = [w.mapChests, w.shrines, w.races, w.skulls, w.bossTotems][st.step - 8];
      const p = list ? list[st.target] : w.totem;
      const x = p.sx ?? p.x,
        z = p.sz ?? p.z;
      return Math.hypot(x - w.player.x, z - w.player.z);
    });
    expect(near, PLACES[k]).toBeLessThan(80);
  }
});

test('The skull and the boss totem must be activated', async ({ page, hasTouch }) => {
  test.setTimeout(120_000); // deux jauges à remplir en temps de jeu sous SwiftShader
  await guided(page, hasTouch);
  await calm(page);
  const place = (kind: 'skulls' | 'bossTotems') =>
    page.evaluate((k) => {
      const G = (window as any).__game;
      const p = G.world[k][G.guide.target];
      return { x: p.x as number, z: p.z as number };
    }, kind);
  // le crâne : la consigne dit ce que c'est, puis ce que ça fait ; elle reste tant qu'il n'est pas activé
  await jumpTo(page, S.skull);
  await expect(page.locator('#tutoText')).toHaveText(
    "Reste dans le crâne pour l'activer : la difficulté monte, et les récompenses aussi",
  );
  await expect(page.locator('#tutoArrow')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(await g(page)).toBe(S.skull);
  // activé : une bannière redit son effet, puis l'étape du totem de boss, qui attend aussi
  const sk = await place('skulls');
  await page.evaluate((p) => (window as any).__game.debug.teleport(p.x, p.z), sk);
  await expect(page.locator('#banner')).toContainText('plus de monstres, plus de récompenses', { timeout: 40_000 });
  await page.waitForFunction((n) => (window as any).__game.guide.step === n, S.bossTotem);
  await shot(page, 'crane-active', hasTouch);
  await expect(page.locator('#tutoText')).toContainText('Active le totem de boss');
  await page.waitForTimeout(1500);
  expect(await g(page)).toBe(S.bossTotem);
  const bt = await place('bossTotems');
  await page.evaluate((p) => (window as any).__game.debug.teleport(p.x, p.z), bt);
  await expect(page.locator('#banner')).toContainText('Un boss de plus à chaque vague de boss de ce monde', {
    timeout: 40_000,
  });
  await page.waitForFunction((n) => (window as any).__game.guide.step === n, S.totem);
  expect(await page.evaluate(() => (window as any).__game.world.bossTotemsOn)).toBe(1);
});

test('The world totem does not activate before its turn', async ({ page, hasTouch }) => {
  test.setTimeout(120_000); // la jauge du totem en temps de jeu sous SwiftShader
  await guided(page, hasTouch);
  await calm(page);
  await jumpTo(page, S.totem);
  await expect(page.locator('#tutoText')).toHaveText(
    "Le totem du monde : tu l'activeras à la fin, pour affronter le boss du monde",
  );
  // le joueur reste dessus avant 8:00 : rien ne s'active, une ligne dit « Pas encore »
  await page.evaluate(() => {
    const G = (window as any).__game;
    G.debug.teleport(G.world.totem.x, G.world.totem.z);
  });
  await expect(page.locator('#tutoText')).toHaveText('Pas encore : ce sera le dernier défi de la partie');
  await shot(page, 'totem-pas-encore', hasTouch);
  // plus que la jauge d'activation, en temps de jeu
  await page.waitForFunction(
    (t0) => (window as any).__game.world.t > t0 + 4,
    await page.evaluate(() => (window as any).__game.world.t as number),
    { timeout: 40_000 },
  );
  expect(await page.evaluate(() => (window as any).__game.world.totem.state)).toBe(0);
  expect(await page.evaluate(() => (window as any).__game.world.totem.charge)).toBe(0);
  // 8:00 : il s'active normalement (le joueur est resté dessus)
  await page.evaluate(() => (window as any).__game.debug.stageTime(481));
  await page.waitForFunction(() => (window as any).__game.world.totem.state === 1, undefined, { timeout: 40_000 });
});

test('Two minutes before the end the totem is mandatory', async ({ page, hasTouch }) => {
  await guided(page, hasTouch);
  await calm(page); // ni marchand ni vague : leur bannière remplacerait celle du totem
  await page.evaluate(() => (window as any).__game.debug.stageTime(481));
  await expect(page.locator('#banner')).toContainText('Va activer la statue rouge');
  await expect(page.locator('#tutoText')).toHaveText("Va activer la statue rouge : le boss du monde t'attend");
  await expect(page.locator('#tutoArrow')).toBeVisible();
  await shot(page, 'totem-obligatoire', hasTouch);
  // le chrono s'arrête à 0:30 tant que le totem n'est pas activé
  await page.evaluate(() => (window as any).__game.debug.stageTime(575));
  await expect(page.locator('#time')).toHaveText('0:30');
  await page.waitForTimeout(1200);
  await expect(page.locator('#time')).toHaveText('0:30');
});

test('The guided run boss is a real boss', async ({ page, hasTouch }) => {
  await guided(page, hasTouch);
  // le totem activé à 8:00 (le joueur y va et y reste), le boss vient : un boss normal (PV et dégâts vérifiés au
  // chiffre près par Vitest) ; il tue le joueur
  await page.evaluate(() => {
    const G = (window as any).__game;
    G.debug.stageTime(481);
    const T = G.world.totem;
    G.debug.teleport(T.x, T.z);
    T.charge = 2.9;
  });
  await page.waitForFunction(() => (window as any).__game.world.totem.state === 1);
  const gold = await page.evaluate(() => (window as any).__game.meta.gold as number);
  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#tutoEnd')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#over')).toBeHidden(); // pas l'écran de fin habituel
  await expect(page.locator('#teTitle')).toHaveText('À toi de jouer !');
  await expect(page.locator('#teText')).toContainText('Le Gardien était trop fort');
  await expect(page.locator('#teBonus')).toHaveText('+150');
  const runGold = +(await page.locator('#teGold').textContent())!;
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect(meta.gold).toBe(gold + runGold + 150);
  expect(meta.tutorial).toBe(1);
  expect(meta.reveal).toBe(4);
  expect(meta.bestTime).toBe(0); // ni record…
  expect(meta.streak.count).toBe(0); // …ni série
  await shot(page, 'a-toi-de-jouer', hasTouch);
  // « Jouer » : une partie normale, adoucie (la première des deux qui suivent la partie guidée)
  if (hasTouch) await page.locator('#tePlayBtn').tap();
  else await page.locator('#tePlayBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  const w = await page.evaluate(() => {
    const x = (window as any).__game.world;
    return { tutorial: x.tutorial, softHp: x.softHp };
  });
  expect(w.tutorial).toBe(false);
  expect(w.softHp).toBeLessThan(1);
  await expect(page.locator('#banner')).not.toContainText('Nouveau');
});

test('Beating the guided run boss shows the portal', async ({ page, hasTouch }) => {
  test.setTimeout(120_000); // le portail et l'arrivée au monde 2 sous SwiftShader
  await guided(page, hasTouch);
  await calm(page); // ni marchand ni vague : leurs bannières cacheraient celle du chrono à 0
  await page.evaluate(() => {
    const G = (window as any).__game;
    G.debug.stageTime(481);
    const T = G.world.totem;
    G.debug.teleport(T.x, T.z);
    T.charge = 2.9;
  });
  await page.waitForFunction(() => (window as any).__game.world.totem.state === 1);
  // le boss tombe : ralenti, consigne et flèche vers le portail
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    const b = w.enemies[w.bossIndex];
    b.hp = 1;
    b.x = b.px = w.player.x + 3;
    b.z = b.pz = w.player.z;
  });
  await expect(page.locator('#tutoText')).toHaveText('Un portail est apparu : entre dedans pour découvrir la suite');
  await page.waitForFunction(() => (window as any).__game.tutoScale < 1); // ralenti
  await expect(page.locator('#tutoArrow')).toBeVisible();
  await shot(page, 'portail-guidee', hasTouch);
  // il entre dans le portail : la consigne du nouveau monde, la partie continue
  await page.evaluate(() => {
    const G = (window as any).__game;
    G.debug.teleport(G.world.totem.x, G.world.totem.z);
  });
  await playUntil(page, hasTouch, () => page.evaluate(() => (window as any).__game.world.stage === 1));
  await expect(page.locator('#tutoText')).toHaveText('Monde 2 : nouvelle carte, ta build te suit');
  expect(await page.evaluate(() => (window as any).__game.world.tutorial)).toBe(true);
  // sa fin ouvre la feuille de fin de guide, avec le texte de victoire
  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#tutoEnd')).toBeVisible({ timeout: 8000 });
  await expect(page.locator('#teText')).toContainText('Tu as battu le Gardien');
  await expect(page.locator('#teBonus')).toHaveText('+150');
  await shot(page, 'victoire-guidee', hasTouch);
  const hints = await page.evaluate(() => (window as any).__game.meta.hints as number);
  expect(hints & (1 << 4)).toBeTruthy(); // le portail…
  expect(hints & (1 << 5)).toBeTruthy(); // …et le nouveau monde ne reviennent plus
});

test('The portal is explained the first time', async ({ page, hasTouch }) => {
  await openGame(page);
  await page.evaluate(() => (window as any).__game.setMeta({ ...(window as any).__game.meta, hints: 0 }));
  await page.evaluate(() => (window as any).__game.start(3));
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.evaluate(() => {
    const G = (window as any).__game;
    G.debug.god();
    const T = G.world.totem;
    G.debug.teleport(T.x, T.z);
    T.charge = 2.9;
  });
  await page.waitForFunction(() => (window as any).__game.world.totem.state === 1);
  // le boss du totem tombe sous les coups du héros, dans un pas de jeu (comme en partie)
  await page.evaluate(() => {
    const w = (window as any).__game.world;
    const b = w.enemies[w.bossIndex];
    b.hp = 1;
    b.x = b.px = w.player.x + 3;
    b.z = b.pz = w.player.z;
  });
  await expect(page.locator('#tutoText')).toHaveText('Un portail est apparu : entre dedans pour découvrir la suite');
  await page.waitForFunction(() => (window as any).__game.tutoScale < 1); // ralenti
  await expect(page.locator('#tutoArrow')).toBeVisible();
  await shot(page, 'portail', hasTouch);
  // retenue : elle ne revient plus
  const hints = await page.evaluate(() => (window as any).__game.meta.hints as number);
  expect(hints & (1 << 4)).toBeTruthy();
});

test('The guided run can be skipped from the pause', async ({ page, hasTouch }) => {
  await guided(page, hasTouch);
  await expect(page.locator('#skipTutoBtn')).toBeHidden(); // pas sur l'écran de jeu
  if (hasTouch) await page.locator('#pauseBtn').tap();
  else await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  await expect(page.locator('#skipTutoBtn')).toBeVisible();
  await shot(page, 'pause-passer', hasTouch);
  if (hasTouch) await page.locator('#skipTutoBtn').tap();
  else await page.locator('#skipTutoBtn').click();
  await expect(page.locator('#menu')).toBeVisible();
  expect(await app(page)).toBe('menu');
  const meta = await page.evaluate(() => (window as any).__game.meta);
  expect([meta.tutorial, meta.reveal, meta.softLeft, meta.runs]).toEqual([2, 4, 2, 0]);
  await expect(page.locator('#resumeRunBtn')).toBeHidden(); // la partie ne compte pas et ne reste pas
  // « Jouer » : une partie normale, tout dévoilé ; l'Aide peut la relancer
  await play(page, hasTouch);
  expect(await page.evaluate(() => (window as any).__game.world.tutorial)).toBe(false);
});

test('An interrupted guided run resumes at its step', async ({ page, hasTouch }) => {
  await guided(page, hasTouch);
  await jumpTo(page, S.shrine);
  const target = await page.evaluate(() => (window as any).__game.guide.target as number);
  // fermée en plein jeu : la page se cache (pause et sauvegarde), puis on rouvre le jeu
  if (hasTouch) await page.locator('#pauseBtn').tap();
  else await page.keyboard.press('Escape');
  await expect(page.locator('#pause')).toBeVisible();
  await page.reload();
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await expect(page.locator('#resumeRunBtn')).toBeVisible();
  if (hasTouch) await page.locator('#resumeRunBtn').tap();
  else await page.locator('#resumeRunBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'pause');
  const st = await page.evaluate(() => {
    const G = (window as any).__game;
    return { tutorial: G.world.tutorial, step: G.guide.step, target: G.guide.target };
  });
  expect(st).toEqual({ tutorial: true, step: S.shrine, target });
  if (hasTouch) await page.locator('#resumeBtn').tap();
  else await page.locator('#resumeBtn').click();
  await expect(page.locator('#tutoText')).toContainText('sanctuaire');
});

test('The guided run can be replayed from the help', async ({ page, hasTouch }) => {
  await openGame(page);
  // « Comment jouer » est dans les réglages
  if (hasTouch) await page.locator('#settingsBtn').tap();
  else await page.locator('#settingsBtn').click();
  if (hasTouch) await page.locator('#helpBtn').tap();
  else await page.locator('#helpBtn').click();
  await expect(page.locator('#helpTutoBtn')).toHaveText('Rejouer la partie guidée');
  if (hasTouch) await page.locator('#helpTutoBtn').tap();
  else await page.locator('#helpTutoBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  expect(await page.evaluate(() => (window as any).__game.world.tutorial)).toBe(true);
});
