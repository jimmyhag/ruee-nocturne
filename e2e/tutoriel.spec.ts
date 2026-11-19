// Partie guidée (docs/specs/tutoriel.md) : l'interface, sur PC (clavier) et sur téléphone (doigt), un test par scénario
// d'interface (titres en anglais). La simulation et la méta sont dans src/meta/tutorial.test.ts. Les captures de chaque
// étape du guide (téléphone) vont dans docs/captures/tutoriel/ quand CAPTURES=1.
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { collectConsoleErrors, openGame } from './helpers';

/** Avec `tuto=1`, « Jouer » lance la partie guidée d'un nouveau joueur même sous ?debug (comme help=1 pour l'aide). */
const TUTO_URL = '/?debug=1&tuto=1&help=1';
const S = { move: 0, fire: 1, cards: 3, jump: 4, slide: 5, slideJump: 6, spell: 7, chest: 8, shrine: 9 } as const;
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
/** « Jouer », au doigt ou à la souris. */
async function play(page: Page, hasTouch: boolean): Promise<void> {
  if (hasTouch) await page.locator('#playBtn').tap();
  else await page.locator('#playBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
}
/** La partie guidée en cours, héros increvable (les gestes se testent sans mourir sous SwiftShader). */
async function guided(page: Page, hasTouch: boolean): Promise<void> {
  await newPlayer(page);
  await play(page, hasTouch);
  // invulnérable (pas de PV géants à l'écran : les captures montrent le HUD d'une vraie partie)
  await page.evaluate(() => ((window as any).__game.world.player.invul = 1e9));
}
async function jumpTo(page: Page, step: number): Promise<void> {
  await page.evaluate((n) => (window as any).__game.guideStep(n), step);
  await page.waitForFunction((n) => (window as any).__game.guide.step === n, step);
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
  // l'écran « Comment jouer » ne s'ouvre plus au premier lancement d'un nouveau joueur
  await expect(page.locator('#menu')).toBeVisible();
  await expect(page.locator('#help')).toBeHidden();
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
  expect(errors).toEqual([]);
});

test('A new player starts the guided run with Enter too', async ({ page, hasTouch }) => {
  test.skip(hasTouch, 'clavier'); // règle 4 : le doigt passe par « Jouer » (test précédent)
  await newPlayer(page);
  await expect(page.locator('#menu')).toBeVisible();
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

test('Two minutes before the end the totem is mandatory', async ({ page, hasTouch }) => {
  await guided(page, hasTouch);
  await page.evaluate(() => (window as any).__game.debug.stageTime(481));
  await expect(page.locator('#banner')).toContainText('Va activer le totem rouge');
  await expect(page.locator('#tutoText')).toHaveText("Va activer le totem rouge : le boss du monde t'attend");
  await expect(page.locator('#tutoArrow')).toBeVisible();
  await shot(page, 'totem-obligatoire', hasTouch);
  // le chrono s'arrête à 0:30 tant que le totem n'est pas activé
  await page.evaluate(() => (window as any).__game.debug.stageTime(575));
  await expect(page.locator('#time')).toHaveText('0:30');
  await page.waitForTimeout(1200);
  await expect(page.locator('#time')).toHaveText('0:30');
});

test('The guided run boss is too strong', async ({ page, hasTouch }) => {
  await guided(page, hasTouch);
  // le totem activé (le joueur y va et y reste), le boss vient ; il tue le joueur
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
