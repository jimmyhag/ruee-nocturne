// Phase 21 : poids de pose des ennemis instanciés. Chaque ennemi mélange deux poses cuites voisines (cibles de morph
// absolues) ; une ligne de la morphTexture d'un InstancedMesh = [poids de base, poids pose 0, poids pose 1, …].
// Pur (aucun import de three) : testé par Vitest, appelé dans la boucle de rendu sans allocation.

/**
 * Écrit la ligne `row` (largeur `len` = 1 + nombre de poses) : boucle de `n` poses commençant à `start`, position
 * `cycle` en tours (1 = une boucle complète ; négatif accepté). Poids de base 0 : les poses sont absolues.
 */
export function writeLoopPose(
  data: Float32Array,
  row: number,
  len: number,
  start: number,
  n: number,
  cycle: number,
): void {
  const o = row * len;
  for (let i = 0; i < len; i++) data[o + i] = 0;
  const f = (cycle - Math.floor(cycle)) * n;
  const a = Math.floor(f) % n;
  const w = f - Math.floor(f);
  data[o + 1 + start + a] = 1 - w;
  data[o + 1 + start + ((a + 1) % n)] += w;
}

/** Comme writeLoopPose, mais pour un geste joué une fois : `t` de 0 (première pose) à 1 (dernière), borné. */
export function writeOncePose(data: Float32Array, row: number, len: number, start: number, n: number, t: number): void {
  const o = row * len;
  for (let i = 0; i < len; i++) data[o + i] = 0;
  const f = Math.min(1, Math.max(0, t)) * (n - 1);
  const a = Math.min(n - 2, Math.floor(f));
  if (n < 2) {
    data[o + 1 + start] = 1;
    return;
  }
  const w = f - a;
  data[o + 1 + start + a] = 1 - w;
  data[o + 1 + start + a + 1] = w;
}
