// 1.69.2 (docs/specs/rendu-allege.md) : paliers du rendu « auto » et l'automate qui choisit le palier. Pur (ni three, ni
// DOM) : testé par Vitest ; `main.ts` lui passe les mesures d'une fenêtre de 2 s, `GameScene.setQuality` applique le palier.
// Descente : on allège d'abord ce qui se dessine (à résolution pleine), puis on baisse la résolution, jamais jusqu'au
// mode pixel (réglage manuel seulement). Remontée d'un cran quand les images redeviennent confortables.

/** Paliers du réglage auto, du plus beau au plus léger (décision 1). `scale` : facteur de la résolution interne nette. */
export const QUALITY_STEPS: readonly { readonly lite: boolean; readonly scale: number; readonly name: string }[] = [
  { lite: false, scale: 1, name: 'net' },
  { lite: true, scale: 1, name: 'allégé' },
  { lite: true, scale: 0.85, name: 'allégé ×0,85' },
  { lite: true, scale: 0.7, name: 'allégé ×0,7' },
  { lite: true, scale: 0.6, name: 'allégé ×0,6' },
];
const LAST_STEP = QUALITY_STEPS.length - 1;

/** Seuils de l'automate (décisions 5 et 6). Une fenêtre de mesure dure 2 s (`main.ts`). */
export const AUTO_QUALITY = {
  /** ms : p95 des intervalles entre images au-delà duquel une fenêtre est lente */
  slowP95: 24,
  /** fenêtres lentes de suite avant de descendre d'un palier (6 s) */
  slowWindows: 3,
  /** ms : p95 des intervalles sous lequel une fenêtre est confortable */
  calmP95: 18,
  /** fenêtres confortables de suite avant de remonter d'un palier (10 s) */
  calmWindows: 5,
  /** part du p95 des intervalles au-delà de laquelle le JS est le goulot : la résolution ne baisse pas */
  cpuShare: 0.7,
  /** s : un palier qui retombe moins de 20 s après une remontée reste bloqué pour la partie (anti yo-yo) */
  relock: 20,
};

/** État de l'automate. `floor` : palier le plus beau encore permis dans la partie (0 = net). */
export interface AutoQuality {
  step: number;
  floor: number;
  slow: number;
  calm: number;
  climbedAt: number;
  resDropped: boolean;
}

/** Ce que la fenêtre a changé : la bannière n'accompagne que la première baisse de résolution d'une partie. */
export const enum QualityChange {
  None,
  Down,
  FirstResolutionDrop,
  Up,
}

export function newAutoQuality(): AutoQuality {
  return { step: 0, floor: 0, slow: 0, calm: 0, climbedAt: -1e9, resDropped: false };
}

/** Nouvelle partie : le palier atteint reste (même appareil), le blocage et la bannière repartent de zéro. */
export function qualityNewRun(q: AutoQuality): void {
  q.floor = 0;
  q.slow = q.calm = 0;
  q.climbedAt = -1e9;
  q.resDropped = false;
}

/** Fenêtre hors jeu (menu, pause, carte de niveau, premières secondes) : les séries repartent de zéro. */
export function qualityIdle(q: AutoQuality): void {
  q.slow = q.calm = 0;
}

/**
 * Une fenêtre de mesure en jeu : `gapP95` (ms, intervalles entre images), `jsP95` (ms, temps JS d'une image), `t` (s,
 * horloge réelle). Trois fenêtres lentes de suite : un palier plus bas, sauf si le JS est le goulot et que le rendu est
 * déjà allégé (baisser la résolution n'accélère pas le JS). Cinq fenêtres confortables de suite : un palier plus haut,
 * jamais au-dessus de `floor`.
 */
export function qualityWindow(q: AutoQuality, gapP95: number, jsP95: number, t: number): QualityChange {
  const A = AUTO_QUALITY;
  if (gapP95 > A.slowP95) {
    q.slow++;
    q.calm = 0;
  } else if (gapP95 < A.calmP95) {
    q.calm++;
    q.slow = 0;
  } else q.slow = q.calm = 0;
  if (q.slow >= A.slowWindows) {
    q.slow = 0;
    const cpuBound = jsP95 > A.cpuShare * gapP95;
    if (q.step >= LAST_STEP || (q.step > 0 && cpuBound)) return QualityChange.None;
    q.step++;
    if (t - q.climbedAt < A.relock) q.floor = Math.max(q.floor, q.step);
    if (QUALITY_STEPS[q.step].scale < QUALITY_STEPS[q.step - 1].scale && !q.resDropped) {
      q.resDropped = true;
      return QualityChange.FirstResolutionDrop;
    }
    return QualityChange.Down;
  }
  if (q.calm >= A.calmWindows) {
    q.calm = 0;
    if (q.step <= q.floor) return QualityChange.None;
    q.step--;
    q.climbedAt = t;
    return QualityChange.Up;
  }
  return QualityChange.None;
}

/**
 * Seuil de distance² qui garde au plus `cap` valeurs parmi les `n` premières de `d2` : la `cap`-ième plus petite (ou
 * +∞ si tout tient). `d2` est réordonné en place (sélection rapide, sans allocation) : passer une copie de travail.
 */
export function nearestCut(d2: Float32Array, n: number, cap: number): number {
  if (n <= cap) return Infinity;
  if (cap <= 0) return -Infinity;
  const k = cap - 1;
  let lo = 0,
    hi = n - 1;
  while (lo < hi) {
    const pivot = d2[(lo + hi) >> 1];
    let i = lo,
      j = hi;
    while (i <= j) {
      while (d2[i] < pivot) i++;
      while (d2[j] > pivot) j--;
      if (i <= j) {
        const s = d2[i];
        d2[i] = d2[j];
        d2[j] = s;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else break;
  }
  return d2[k];
}

/**
 * p95 des `n` dernières valeurs écrites dans l'anneau `ring` (prochaine écriture à l'index `idx`, qui croît sans
 * fin) : les images d'une fenêtre de mesure seulement, pas celles d'avant (à 5 images par seconde, l'anneau de 120
 * images couvre 24 s). `tmp` (même taille que l'anneau) est la copie de travail. Sans allocation.
 */
export function windowP95(ring: Float64Array, idx: number, n: number, tmp: Float64Array): number {
  const N = ring.length;
  n = Math.max(1, Math.min(N, n));
  tmp.fill(-Infinity);
  for (let k = 1; k <= n; k++) tmp[k - 1] = ring[(((idx - k) % N) + N) % N];
  tmp.sort();
  return tmp[N - n + ((n * 0.95) | 0)];
}
