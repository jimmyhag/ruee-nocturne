// Mode stress (?stress=400) : 400 ennemis maintenus, budgets de rendu tenus (PLAN.md §4.3).
// Les fps ne sont pas vérifiés ici (SwiftShader) : ils se lisent sur un vrai téléphone, voir docs/GATES.md phase 1.
import { expect, test } from '@playwright/test';
import { collectConsoleErrors } from './helpers';

test('400 ennemis : budget de draw calls et de triangles tenu, onglet perf lisible', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/?debug=1&stress=400');
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  expect(await page.evaluate(() => (window as any).__game.debug.stressTarget)).toBe(400);
  // rendu « pixel » pour la mesure : les budgets (appels, triangles) ne dépendent pas de la résolution, et SwiftShader
  // en résolution native (phase 9) tourne trop lentement sur le runner de CI pour que le ratio temps de jeu tienne
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'pixel' } });
  });

  await page.locator('#playBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.waitForFunction(() => (window as any).__game.world.enemyCount >= 380, null, { timeout: 15_000 });
  // phase 20 : mesure avec les modèles KayKit chargés (héros glTF, décor), pas avec le repli procédural
  await page.waitForFunction(
    () => {
      const s = (window as any).__game.scene;
      return s.heroKind === 'gltf' && s.propsReady === true && s.enemyKind === 'gltf';
    },
    null,
    { timeout: 20_000 },
  );
  await page.waitForTimeout(2500); // quelques fenêtres de mesure

  const state = await page.evaluate(() => {
    const g = (window as any).__game;
    return {
      enemies: g.world.enemyCount as number,
      hp: g.world.player.hp as number,
      calls: g.renderer.info.render.calls as number,
      triangles: g.renderer.info.render.triangles as number,
      perf: (document.getElementById('perf') as HTMLElement).textContent ?? '',
      perfHidden: (document.getElementById('perf') as HTMLElement).hidden,
    };
  });
  expect(state.enemies).toBeGreaterThanOrEqual(380);
  expect(state.hp).toBeGreaterThan(1000); // god mode : on mesure le rendu, pas la survie
  expect(state.calls, 'draw calls ≤ 40').toBeLessThanOrEqual(40);
  expect(state.triangles, 'triangles ≤ 150 k').toBeLessThan(150_000);
  expect(state.perfHidden).toBe(false);
  expect(state.perf).toMatch(/fps \d+/);
  expect(state.perf).toMatch(/ennemis (3[89]\d|4\d\d|5\d\d)/);
  // phase 2 : le hit-stop est borné, le temps de jeu suit le temps réel même avec des kills à chaque frame
  // (SwiftShader rend trop lentement pour un seuil strict : on vérifie la mesure et qu'elle n'est pas figée)
  const ratio = +(state.perf.match(/temps ×([\d.]+)/)?.[1] ?? '0');
  expect(ratio, 'temps de jeu / temps réel').toBeGreaterThan(0.3);
  await page.screenshot({ path: `shots/${info.project.name}-stress.png`, animations: 'disabled' });
  console.log(`[${info.project.name}] ${state.perf.replace(/\n/g, ' | ')}`);
  expect(errors).toEqual([]);
});

// Phase 20 (relecture perf) : le décor KayKit est dense par endroits (lanternes des cercles de pierres, bois,
// cimetières) ; le budget doit tenir au pire point de la carte, sort à silhouettes en cours (Bond de l'Éclaireuse).
test('400 ennemis au point le plus dense du décor, pendant un sort : budget tenu', async ({ page }, info) => {
  await page.goto('/?debug=1&stress=400');
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'pixel' } });
  });
  await page.locator('#playBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.waitForFunction(
    () => {
      const s = (window as any).__game.scene;
      return s.heroKind === 'gltf' && s.propsReady === true && s.enemyKind === 'gltf';
    },
    null,
    { timeout: 20_000 },
  );
  // point le plus dense : poids ≈ triangles (arbre 600, lanterne 570, cimetière 1 000) à moins de 30 u
  const at = await page.evaluate(() => {
    const s = (window as any).__game.scene;
    const pts: [number, number, number][] = [];
    const T = s.treeData as Float32Array,
      L = s.lampData as Float32Array,
      G = s.graveData as Float32Array;
    for (let i = 0; i < T.length; i += 6) pts.push([T[i], T[i + 2], 600]);
    for (let i = 0; i < L.length; i += 3) pts.push([L[i], L[i + 2], 570]);
    for (let i = 0; i < G.length; i += 4) pts.push([G[i], G[i + 2], 1000]);
    let best = { x: 0, z: 0, w: -1 };
    for (const [x, z] of pts) {
      let w = 0;
      for (const [x2, z2, k] of pts) if ((x - x2) ** 2 + (z - z2) ** 2 < 900) w += k;
      if (w > best.w) best = { x, z, w };
    }
    return best;
  });
  await page.evaluate(({ x, z }) => {
    const g = (window as any).__game;
    g.world.player.need = 1e9; // pas d'écran de niveau pendant la mesure
    g.debug.teleport(x + 1.5, z + 1.5);
  }, at);
  await page.waitForFunction(() => (window as any).__game.world.enemyCount >= 380, null, { timeout: 15_000 });
  await page.waitForTimeout(1200);
  const worst = { calls: 0, triangles: 0 };
  for (let k = 0; k < 6; k++) {
    await page.keyboard.press('ShiftLeft'); // Bond : silhouettes de dash à l'écran
    for (let f = 0; f < 4; f++) {
      await page.waitForTimeout(80);
      const r = await page.evaluate(() => {
        const g = (window as any).__game;
        return { calls: g.renderer.info.render.calls as number, triangles: g.renderer.info.render.triangles as number };
      });
      if (r.triangles > worst.triangles) worst.triangles = r.triangles;
      worst.calls = Math.max(worst.calls, r.calls); // pic d'appels suivi à part (relecture perf phase 29)
    }
    await page.waitForTimeout(400);
  }
  console.log(
    `[${info.project.name}] pire point (${at.x.toFixed(0)}, ${at.z.toFixed(0)}) : ${worst.calls} appels, ${(worst.triangles / 1000).toFixed(1)} k tris`,
  );
  expect(worst.calls, 'draw calls ≤ 40').toBeLessThanOrEqual(40);
  expect(worst.triangles, 'triangles ≤ 150 k (pixel)').toBeLessThan(150_000);

  // phase 21 : en rendu net, squelettes détaillés (≈ 330 triangles) ; budget mobile relevé à 250 k (décision de Jimmy)
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'net' } });
  });
  await page.waitForTimeout(800);
  const net = { calls: 0, triangles: 0 };
  for (let k = 0; k < 3; k++) {
    await page.keyboard.press('ShiftLeft');
    for (let f = 0; f < 4; f++) {
      await page.waitForTimeout(120);
      const r = await page.evaluate(() => {
        const g = (window as any).__game;
        return { calls: g.renderer.info.render.calls as number, triangles: g.renderer.info.render.triangles as number };
      });
      if (r.triangles > net.triangles) net.triangles = r.triangles;
      net.calls = Math.max(net.calls, r.calls);
    }
    await page.waitForTimeout(400);
  }
  console.log(
    `[${info.project.name}] pire point, rendu net : ${net.calls} appels, ${(net.triangles / 1000).toFixed(1)} k tris`,
  );
  expect(net.calls, 'draw calls ≤ 40 (net)').toBeLessThanOrEqual(40);
  expect(net.triangles, 'triangles ≤ 250 k (net)').toBeLessThan(250_000);
});

// Phase 29 : la lisière de la bordure (rochers, sapins, sous-bois) s'ajoute au champ près du bord ; le budget doit
// tenir au coin de la carte et le long du bord nord (le plus profond à l'écran), 400 ennemis, sort en cours.
test('400 ennemis au bord et au coin de la carte, pendant un sort : budget tenu', async ({ page }, info) => {
  await page.goto('/?debug=1&stress=400');
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.locator('#playBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.waitForFunction(
    () => {
      const s = (window as any).__game.scene;
      return s.heroKind === 'gltf' && s.propsReady === true && s.enemyKind === 'gltf';
    },
    null,
    { timeout: 20_000 },
  );
  const measure = async (quality: 'pixel' | 'net') => {
    await page.evaluate((q) => {
      const g = (window as any).__game;
      g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: q } });
    }, quality);
    const worst = { calls: 0, triangles: 0 };
    for (const [x, z] of [
      [162, 162],
      [0, -162],
      [-162, -162],
    ]) {
      await page.evaluate(
        ([x, z]) => {
          const g = (window as any).__game;
          g.world.player.need = 1e9;
          g.debug.teleport(x, z);
        },
        [x, z],
      );
      await page.waitForFunction(() => (window as any).__game.world.enemyCount >= 380, null, { timeout: 15_000 });
      await page.waitForTimeout(800);
      for (let k = 0; k < 2; k++) {
        await page.keyboard.press('ShiftLeft');
        for (let f = 0; f < 4; f++) {
          await page.waitForTimeout(100);
          const r = await page.evaluate(() => {
            const g = (window as any).__game;
            return {
              calls: g.renderer.info.render.calls as number,
              triangles: g.renderer.info.render.triangles as number,
            };
          });
          if (r.triangles > worst.triangles) worst.triangles = r.triangles;
          worst.calls = Math.max(worst.calls, r.calls); // pic d'appels suivi à part (relecture perf phase 29)
        }
      }
    }
    return worst;
  };
  const pixel = await measure('pixel');
  console.log(
    `[${info.project.name}] bord, pixel : ${pixel.calls} appels, ${(pixel.triangles / 1000).toFixed(1)} k tris`,
  );
  expect(pixel.calls, 'draw calls ≤ 40').toBeLessThanOrEqual(40);
  expect(pixel.triangles, 'triangles ≤ 150 k (pixel)').toBeLessThan(150_000);
  const net = await measure('net');
  console.log(`[${info.project.name}] bord, net : ${net.calls} appels, ${(net.triangles / 1000).toFixed(1)} k tris`);
  expect(net.calls, 'draw calls ≤ 40 (net)').toBeLessThanOrEqual(40);
  expect(net.triangles, 'triangles ≤ 250 k (net)').toBeLessThan(250_000);
});

// Phase 30 (relecture perf) : les effets d'armes (sprites lumineux, arcs, éclairs, halo) sous charge. Le kit de départ
// n'a qu'une arme : ici, 4 armes (le plafond d'emplacements) parmi les plus chargées à l'écran, niveau 8, 400 ennemis.
test('400 ennemis, 4 armes au niveau 8 : budget tenu avec les effets', async ({ page }, info) => {
  const errors = collectConsoleErrors(page);
  await page.goto('/?debug=1&stress=400');
  await page.waitForFunction(() => (window as any).__game?.ready === true);
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'pixel' } });
  });
  await page.locator('#playBtn').click();
  await page.waitForFunction(() => (window as any).__game.app === 'play');
  await page.waitForFunction(
    () => {
      const s = (window as any).__game.scene;
      return s.heroKind === 'gltf' && s.propsReady === true && s.enemyKind === 'gltf';
    },
    null,
    { timeout: 20_000 },
  );
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.world.player.need = 1e9;
    for (const k of Object.keys(g.world.weapons)) delete g.world.weapons[k];
    for (const k of ['lames', 'meteores', 'foudre', 'orbe']) g.debug.give(k, 8);
  });
  await page.waitForFunction(() => (window as any).__game.world.enemyCount >= 380, null, { timeout: 15_000 });
  await page.waitForTimeout(1500);
  const measure = async () => {
    const worst = { calls: 0, triangles: 0, glow: 0 };
    for (let f = 0; f < 16; f++) {
      await page.waitForTimeout(90);
      const r = await page.evaluate(() => {
        const g = (window as any).__game;
        return {
          calls: g.renderer.info.render.calls as number,
          triangles: g.renderer.info.render.triangles as number,
          glow: g.scene.glowW.mesh.count as number,
        };
      });
      worst.calls = Math.max(worst.calls, r.calls);
      worst.triangles = Math.max(worst.triangles, r.triangles);
      worst.glow = Math.max(worst.glow, r.glow);
    }
    return worst;
  };
  const px = await measure();
  await page.evaluate(() => {
    const g = (window as any).__game;
    g.setMeta({ ...g.meta, settings: { ...g.meta.settings, quality: 'net' } });
  });
  await page.waitForTimeout(800);
  const net = await measure();
  console.log(
    `[${info.project.name}] 4 armes : pixel ${px.calls} appels, ${(px.triangles / 1000).toFixed(1)} k tris ; net ${net.calls} appels, ${(net.triangles / 1000).toFixed(1)} k tris ; lueurs ≤ ${Math.max(px.glow, net.glow)}`,
  );
  expect(px.glow, 'des lueurs sont à l’écran').toBeGreaterThan(0);
  expect(px.calls, 'draw calls ≤ 40').toBeLessThanOrEqual(40);
  expect(px.triangles, 'triangles ≤ 150 k (pixel)').toBeLessThan(150_000);
  expect(net.calls, 'draw calls ≤ 40 (net)').toBeLessThanOrEqual(40);
  expect(net.triangles, 'triangles ≤ 250 k (net)').toBeLessThan(250_000);
  expect(errors).toEqual([]);
});
