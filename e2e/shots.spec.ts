// Captures d'écran pour vérification visuelle (à lire avec l'outil Read, jamais à « supposer »).
// Sortie : shots/<projet>-<écran>.png
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openCharacters, openGame, startRun } from './helpers';

const shot = (name: string, project: string) => ({
  path: `shots/${project}-${name}.png`,
  animations: 'disabled' as const,
});

/** Attend qu'un kill survienne, laisse courir `afterMs` de jeu puis fige la boucle (particules en vol). */
async function freezeAfterKill(page: Page, afterMs: number): Promise<void> {
  await page.evaluate(
    (ms) =>
      new Promise<void>((resolve, reject) => {
        const g = (window as any).__game;
        const k0 = g.world.kills as number;
        const t0 = performance.now();
        let tKill = 0;
        const check = () => {
          if (g.app !== 'play') return reject(new Error('partie interrompue : ' + g.app));
          if (performance.now() - t0 > 8000) return reject(new Error('aucun kill en 8 s'));
          if (!tKill && g.world.kills > k0) tKill = performance.now();
          if (tKill && performance.now() - tKill >= ms) {
            g.debug.speed(0);
            return resolve();
          }
          requestAnimationFrame(check);
        };
        check();
      }),
    afterMs,
  );
}

/** Prend la carte 1 au clavier tant qu'un choix est affiché (niveaux en attente, coffres), puis attend le jeu. */
async function pickUntilPlay(page: Page): Promise<void> {
  for (let i = 0; i < 12; i++) {
    const app = await page.evaluate(() => (window as any).__game.app as string);
    if (app === 'play') return;
    if (app === 'levelup') await page.keyboard.press('Digit1');
    await page.waitForTimeout(250);
  }
  await page.waitForFunction(() => (window as any).__game.app === 'play', null, { timeout: 3000 });
}

test('menu, jeu à 3 min, montée de niveau, mort', async ({ page }, info) => {
  const p = info.project.name;
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true)); // pas d'onglet perf sur les captures
  await page.evaluate(() => document.fonts.ready); // polices auto-hébergées
  await page.screenshot(shot('menu', p));

  await startRun(page, 42);
  await page.evaluate(() => (window as any).__game.debug.warp(180));
  await page.evaluate(() => (window as any).__game.debug.god()); // à 3:00 encerclé, le joueur mourrait avant la capture
  await page.waitForTimeout(600); // quelques frames de rendu après le saut dans la sim
  const app = await page.evaluate(() => (window as any).__game.app as string);
  if (app === 'levelup') {
    // le warp a pu laisser une montée de niveau en attente : on la prend
    await page.locator('#cards .card').first().click();
    await page.waitForTimeout(500);
  }
  await page.screenshot(shot('jeu-3min', p));
  // phase 9 : la même vue en rendu « pixel » (réglage conservé pour les petits appareils), pour comparaison
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'pixel' } });
  });
  await expect(page.locator('canvas#c')).toHaveClass(/pixel/);
  await page.waitForTimeout(150);
  await page.screenshot(shot('jeu-3min-pixel', p));
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'auto' } });
  });

  await page.evaluate(() => (window as any).__game.debug.levelUp());
  await expect(page.locator('#levelup')).toBeVisible();
  await page.waitForTimeout(400); // animation des cartes
  await page.screenshot(shot('levelup', p));
  await page.locator('#cards .card').first().click();

  await page.evaluate(() => (window as any).__game.debug.kill());
  await expect(page.locator('#over')).toBeVisible({ timeout: 5000 });
  await page.waitForTimeout(300);
  await page.screenshot(shot('mort', p));
});

// Porte de phase 2 : kill d'élite (particules, chiffres), montée de niveau (anneau), boss (bannière, barre, recul caméra).
test('game feel : kill d’élite, montée de niveau, boss', async ({ page }, info) => {
  test.setTimeout(120_000); // 40 à 58 s en rendu logiciel, pour 60 s par défaut
  const p = info.project.name;
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  await startRun(page, 7);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    // l'XP du kill d'élite déclenchait parfois une montée de niveau pendant la fenêtre de capture (« partie interrompue »)
    g.world.player.need = 1e9;
  });
  // élite : une Brute à 1 PV posée à 2 u, tuée par la première arme qui la touche
  await page.evaluate(() => (window as any).__game.debug.weak(2, 2));
  await freezeAfterKill(page, 140);
  await page.waitForTimeout(150);
  const parts = await page.evaluate(() => (window as any).__game.scene.particles.alive as number);
  expect(parts, 'particules du kill en vol').toBeGreaterThan(20);
  await page.screenshot(shot('kill-elite', p));

  // montée de niveau : anneau de particules autour du joueur, juste avant l'écran de choix
  await page.evaluate(() => (window as any).__game.debug.speed(1));
  await page.evaluate(() => (window as any).__game.debug.levelUp());
  await expect(page.locator('#levelup')).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot(shot('levelup-feel', p));
  await pickUntilPlay(page); // parité clavier : touche 1 = carte 1 (plusieurs niveaux ou un coffre peuvent être en attente)

  // boss : depuis la phase 37, il vient du totem. Le héros est posé dans son cercle et la boucle réelle charge le
  // totem (3 s) puis fait sortir le Gardien (bannière, son, shake passent par handleEvents) ; ramené à 6 u
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.world.player.need = 1e9; // la montée de niveau forcée a remis le seuil : une autre figerait la charge du totem
    g.debug.teleport(g.world.totem.x, g.world.totem.z);
  });
  await pickUntilPlay(page);
  // la charge (3 s de jeu) prend 11 à 14 s réelles en rendu logiciel, autant avant qu'après la phase 50 (mesuré) :
  // 15 s ne laissaient aucune marge sur le runner de CI (rouge sur le correctif de la 1.53.0)
  await page.waitForFunction(() => (window as any).__game.world.bossIndex >= 0, null, { timeout: 45_000 });
  await page.evaluate(() => (window as any).__game.debug.pullBoss(6));
  await page.waitForTimeout(400);
  await expect(page.locator('#banner')).toHaveClass(/on/);
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(100);
  await expect(page.locator('#bossbar')).toBeVisible();
  await page.screenshot(shot('boss', p));
  await page.evaluate(() => (window as any).__game.debug.speed(1));
});

// Porte de phase 3 : armes très améliorées (phase 12 : lignes), Colosse et ses cercles rouges, lac.
test('contenu : armes améliorées, Colosse, lac', async ({ page }, info) => {
  const p = info.project.name;
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  await startRun(page, 11);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9; // pas de montée de niveau pendant la capture : l'écran de choix figerait la sim
    g.debug.give('aura', 1);
    g.debug.upgrade('aura', 20);
    g.debug.give('lames', 1);
    g.debug.upgrade('lames', 20);
    g.debug.give('boomerang', 1);
    g.debug.upgrade('boomerang', 12);
    g.debug.give('mines', 1);
    g.debug.upgrade('mines', 12);
    g.debug.spawn(2, 6, 4); // des Brutes autour pour voir les coups
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(100);
  await page.screenshot(shot('armes-ameliorees', p));
  await page.evaluate(() => (window as any).__game.debug.speed(1));

  // Colosse à 8 u : cercles rouges télégraphiés 1 s sous le joueur
  await page.evaluate(() => (window as any).__game.debug.spawn(7, 1, 8));
  await page.waitForFunction(() => (window as any).__game.world.shotCount > 0, null, { timeout: 8000 });
  await page.waitForTimeout(450);
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(100);
  await page.screenshot(shot('colosse', p));
  await page.evaluate(() => (window as any).__game.debug.speed(1));

  // lac : le joueur est ralenti et l'eau est visible
  await page.evaluate(() => {
    const g = (window as any).__game;
    const l = g.world.lakes[0];
    g.debug.teleport(l.x, l.z);
  });
  await page.waitForTimeout(600);
  const speed = await page.evaluate(() => {
    const g = (window as any).__game;
    return g.world.speedAt(g.world.player.x, g.world.player.z) as number;
  });
  expect(speed).toBeLessThan(1);
  await page.screenshot(shot('lac', p));
});

// Porte de phase 6 : la grille des neuf personnages (tous débloqués) et la traînée de feu du Feu follet.
test('personnages : grille complète et traînée du Feu follet', async ({ page }, info) => {
  const p = info.project.name;
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  await page.evaluate(() =>
    (window as any).__game.setMeta({
      version: 3,
      runs: 12, // un joueur qui a tout débloqué a joué : sans parties, les onglets attendent la première (Nocturne)
      gold: 5000,
      achievements: ['survie3', 'survie10', 'kills500', 'boss1', 'win', 'intouchable'],
      bought: ['veilleuse', 'braconnier', 'colporteur'],
      character: 'feufollet',
    }),
  );
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('#chars .char.locked')).toHaveCount(0);
  await openCharacters(page); // phase 14 : feuille « Personnage »
  await page.waitForTimeout(300);
  await page.screenshot(shot('personnages', p));
  await page.locator('#charactersBackBtn').click(); // retour à l'accueil : la barre d'icônes est derrière la feuille
  // phase 17 : la feuille Emplacements (la boutique par personnage n'existe plus)
  await page.locator('#shopBtn').click();
  await expect(page.locator('#slotList .slotrow').first()).toBeVisible();
  await page.waitForTimeout(200);
  await page.screenshot(shot('emplacements', p));
  await page.locator('#shopBackBtn').click();

  await startRun(page, 42);
  await page.evaluate(() => (window as any).__game.debug.god());
  await page.evaluate(() => (window as any).__game.debug.warp(60));
  await pickUntilPlay(page);
  await page.evaluate(() => (window as any).__game.debug.spawn(0, 24, 5));
  // une Comète vers la droite : la traînée se pose derrière le joueur (durée comptée en temps de jeu : sous SwiftShader
  // en rendu net, la boucle avance moins vite que l'horloge)
  const t0 = await page.evaluate(() => (window as any).__game.world.t as number);
  await page.keyboard.down('KeyD');
  await page.keyboard.press('ShiftLeft');
  await page.waitForFunction((t0) => (window as any).__game.world.t - t0 > 0.5, t0);
  await page.keyboard.up('KeyD');
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(100);
  const fires = await page.evaluate(() => {
    const w = (window as any).__game.world;
    let n = 0;
    for (let i = 0; i < w.projCount; i++) if (w.projs[i].kind === 3) n++;
    return n;
  });
  expect(fires, 'plaques de feu posées par la Comète').toBeGreaterThan(3);
  await page.screenshot(shot('feufollet', p));
  await page.evaluate(() => (window as any).__game.debug.speed(1));
});

test('phase 17 : coffre d’objets, échoppe du marchand, HUD avec objets et synergie', async ({ page }, info) => {
  const p = info.project.name;
  await openGame(page);
  await startRun(page, 17);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.debug.warp(30);
    g.world.player.need = 1e9;
    g.world.gold = 420;
    g.debug.give('foudre', 3);
    g.debug.item('talisman');
    g.debug.item('cape');
    g.debug.synergy(0); // Orage
  });
  await pickUntilPlay(page);
  await page.evaluate(() => (window as any).__game.debug.chest(true));
  await page.waitForSelector('#levelup:not([hidden])');
  await page.waitForTimeout(250);
  await page.screenshot(shot('coffre-objets', p));
  await pickUntilPlay(page);
  // l'échoppe à 5 u devant le joueur : on la regarde avant d'y entrer
  await page.evaluate(() => (window as any).__game.debug.merchant(5));
  await page.waitForTimeout(700);
  await page.screenshot(shot('echoppe', p));
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.teleport(g.world.merchant.x, g.world.merchant.z + 1);
  });
  await page.waitForSelector('#merchant:not([hidden])');
  await page.waitForTimeout(250);
  await page.screenshot(shot('marchand', p));
  await page.locator('#mLeave').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.teleport(g.world.merchant.x + 3, g.world.merchant.z + 5);
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => (window as any).__game.debug.speed(0));
  await page.waitForTimeout(100);
  await page.screenshot(shot('hud-objets', p));
  await page.evaluate(() => (window as any).__game.debug.speed(1));
  await expect(page.locator('#gear .git')).toHaveCount(4);
  await expect(page.locator('#kit .syn')).toHaveCount(1);
});

// Interface « Nocturne » (docs/specs/ui-nocturne.md) : chaque écran, pour comparer à la maquette (docs/design/menus/)
// et garder l'avant / après dans docs/captures/nocturne/. Sortie : shots/<projet>-ui-<écran>.png
test('interface : chaque écran du menu et de la partie', async ({ page }, info) => {
  test.setTimeout(420_000); // une trentaine d'écrans sous SwiftShader
  const p = info.project.name;
  const ui = (name: string) => shot('ui-' + name, p);
  await page.goto('/?debug=1&consent=1');
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({
      ...g.meta,
      reveal: 4,
      seenReveal: 4,
      gold: 2360,
      runs: 12,
      bestTime: 872,
      bestKills: 1830,
      achievements: ['survie3', 'survie10', 'kills500'],
      character: 'sorciere',
    });
    (document.getElementById('perf') as HTMLElement).hidden = true;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot(ui('menu'));
  // bouton du menu, écran, bouton retour
  const sheets: [string, string, string][] = [
    ['charsBtn', 'heros', 'charactersBackBtn'],
    ['shopBtn', 'emplacements', 'shopBackBtn'],
    ['achBtn', 'succes', 'achBackBtn'],
    ['libBtn', 'bibliotheque', 'libBackBtn'],
    ['boardBtn', 'classement', 'boardBackBtn'],
    ['dailyBtn', 'defi', 'dailyBackBtn'],
    ['notesBtn', 'nouveautes', 'notesBackBtn'],
    ['accountBtn', 'compte', 'accountBackBtn'],
    ['settingsBtn', 'reglages', 'settingsBackBtn'],
  ];
  for (const [btn, name, back] of sheets) {
    await page.locator('#' + btn).click();
    await page.waitForTimeout(500);
    await page.screenshot(ui(name));
    await page.locator('#' + back).click();
    await page.waitForFunction(() => (window as any).__game.app === 'menu');
  }
  await startRun(page, 42);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.debug.warp(150);
    g.world.player.need = 1e9;
    g.world.gold = 420;
  });
  await pickUntilPlay(page);
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.speed(0); // partie figée : des PV de joueur ordinaires sur la capture, puis l'invincibilité de nouveau
    g.world.player.maxHp = 130;
    g.world.player.hp = 104;
  });
  await page.waitForTimeout(150);
  await page.screenshot(ui('hud'));
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.debug.speed(1);
  });
  await page.evaluate(() => (window as any).__game.debug.levelUp());
  await page.waitForSelector('#levelup:not([hidden])');
  await page.waitForTimeout(500);
  await page.screenshot(ui('niveau'));
  await pickUntilPlay(page);
  await page.evaluate(() => (window as any).__game.debug.chest(true));
  await page.waitForSelector('#levelup:not([hidden])');
  await page.waitForTimeout(500);
  await page.screenshot(ui('coffre'));
  await pickUntilPlay(page);
  await page.evaluate(() => (window as any).__game.debug.merchant(4));
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.teleport(g.world.merchant.x, g.world.merchant.z + 1);
  });
  await page.waitForSelector('#merchant:not([hidden])');
  await page.waitForTimeout(500);
  await page.screenshot(ui('marchand'));
  await page.locator('#mLeave').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.locator('#pauseBtn').click();
  await page.waitForSelector('#pause:not([hidden])');
  await page.waitForTimeout(300);
  await page.screenshot(ui('pause'));
  await page.locator('#pauseMapBtn').click();
  await page.waitForSelector('#map:not([hidden])');
  await page.waitForTimeout(300);
  await page.screenshot(ui('carte'));
  await page.keyboard.press('Escape');
  await page.waitForSelector('#pause:not([hidden])');
  await page.locator('#resumeBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.evaluate(() => (window as any).__game.debug.win());
  await page.waitForSelector('#victory:not([hidden])');
  await page.waitForTimeout(400);
  await page.screenshot(ui('victoire'));
  await page.locator('#vEnd').click();
  await page.waitForSelector('#over:not([hidden])');
  await page.waitForTimeout(400);
  await page.screenshot(ui('fin'));
  await page.locator('#menuBtn').click();
  await page.waitForSelector('#consent:not([hidden])');
  await page.waitForTimeout(300);
  await page.screenshot(ui('accord'));
});

// Interface « Nocturne » : les deux autres états de l'accueil (maquettes Menu-Premiere-ouverture et Menu-Reprendre) et
// l'aide. Sortie : shots/<projet>-ui-<écran>.png
test('interface : accueil à la première ouverture, partie à reprendre, aide', async ({ page }, info) => {
  test.setTimeout(180_000);
  const ui = (name: string) => shot('ui-' + name, info.project.name);
  await openGame(page);
  await page.evaluate(() => {
    (window as any).__game.setMeta({ version: 5 }); // nouveau joueur
    (document.getElementById('perf') as HTMLElement).hidden = true;
  });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  await page.screenshot(ui('accueil-premiere'));
  // une partie interrompue en monde 2 à 7:10, chez un joueur avancé
  await page.evaluate(() =>
    (window as any).__game.setMeta({ version: 5, runs: 14, gold: 2360, bestTime: 872, character: 'eclaireuse' }),
  );
  await startRun(page, 7);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.debug.nextStage();
    g.debug.stageTime(430);
    g.debug.speed(0);
  });
  await page.locator('#pauseBtn').click();
  await page.locator('#quitBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'menu');
  await page.waitForTimeout(500);
  await page.screenshot(ui('accueil-reprendre'));
  await page.locator('#settingsBtn').click();
  await page.locator('#helpBtn').click();
  await page.waitForSelector('#help:not([hidden])');
  await page.waitForTimeout(300);
  await page.screenshot(ui('aide'));
});

// Interface « Nocturne » et lot L5 : le palier d'une arme au kit (filet au-dessus de son icône dans la barre d'équipement).
test('interface : HUD avec des armes aux paliers I, II et III', async ({ page }, info) => {
  test.setTimeout(120_000);
  const ui = (name: string) => shot('ui-' + name, info.project.name);
  await openGame(page);
  await page.evaluate(() => ((document.getElementById('perf') as HTMLElement).hidden = true));
  await startRun(page, 3);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.god();
    g.world.player.need = 1e9;
    g.debug.give('orbe', 25); // palier I
    g.debug.give('aura', 50); // palier II
    g.debug.give('lames', 100); // palier III
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.speed(0);
    g.world.player.maxHp = 130;
    g.world.player.hp = 118;
  });
  await page.waitForTimeout(150);
  await expect(page.locator('#gear .gw.tier3')).toHaveCount(1);
  await page.screenshot(ui('hud-paliers'));
  const box = (await page.locator('#gear').boundingBox())!;
  await page.screenshot({
    ...ui('hud-paliers-zoom'),
    clip: { x: Math.max(0, box.x - 12), y: Math.max(0, box.y - 12), width: box.width + 24, height: box.height + 24 },
  });
});

// Interface « Nocturne », décision 17 pour le lot L3 : bouton du défi avec la série, missions du jour, feuille du défi,
// HUD du défi (chrono de 5:00) et écran « Défi réussi ! ». Sortie : shots/<projet>-ui-l3-<écran>.png
test('interface : écrans du lot L3 (série, missions, défi du jour, défi réussi)', async ({ page, hasTouch }, info) => {
  test.setTimeout(180_000);
  const ui = (name: string) => ({ path: `shots/${info.project.name}-ui-${name}.png`, animations: 'disabled' as const });
  const day = (n = 0) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
  await openGame(page);
  await page.evaluate(
    ([yesterday, date]) => {
      (window as any).__game.setMeta({
        version: 5,
        runs: 6,
        gold: 1240,
        bestTime: 412,
        character: 'eclaireuse',
        achievements: ['survie3'],
        streak: { last: yesterday, count: 6, best: 6, jokerWeek: '' },
        missions: {
          date,
          list: [
            { k: 'survive', p: '', goal: 4, prog: 0, done: false },
            { k: 'kills', p: '', goal: 500, prog: 320, done: false },
            { k: 'char', p: 'eclaireuse', goal: 1, prog: 1, done: true },
          ],
        },
        reveal: 4,
        seenReveal: 4,
      });
      (document.getElementById('perf') as HTMLElement).hidden = true;
    },
    [day(-1), day()],
  );
  await page.evaluate(() => document.fonts.ready);
  // passe d'ergonomie : les missions sont repliées sur téléphone (un appui les ouvre), toujours dépliées sur écran large
  if (await page.locator('#missionList .mission').first().isHidden())
    await (hasTouch ? page.locator('#missions summary').tap() : page.locator('#missions summary').click());
  await expect(page.locator('#missionList .mission').first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot(ui('l3-accueil'));
  await page.locator('#dailyBtn').click();
  await page.waitForTimeout(400);
  await page.screenshot(ui('l3-defi'));
  await page.locator('#dailyPlayBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.evaluate(() => (window as any).__game.debug.god());
  await page.waitForFunction(() => (window as any).__game.world.t > 3, null, { timeout: 30_000 });
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.speed(0);
    g.world.player.maxHp = 100;
    g.world.player.hp = 86;
  });
  await page.waitForTimeout(200);
  await page.screenshot(ui('l3-hud'));
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.debug.speed(1);
    g.debug.god();
    g.world.t = g.world.stageT = 299.5; // vivant à 5:00 : le défi est réussi
  });
  // défi v2 : l'écran « Défi réussi ! » propose de continuer ; on termine pour l'écran de fin
  await expect(page.locator('#victory')).toBeVisible({ timeout: 30_000 });
  await page.locator('#vEnd').click();
  await expect(page.locator('#over')).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(1200); // fin du fondu de l'écran de fin
  await page.screenshot(ui('l3-fin'));
});
