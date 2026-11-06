// Constantes de « game feel » (skill game-feel) et contrôleur de hit-stop.
// Côté rendu : rien ici n'influence la simulation. Les valeurs de gameplay restent dans src/sim/balance.ts.

export const FEEL = {
  hitStop: {
    kill: { duration: 0.04, scale: 0.15 }, // skill §2 : 40 ms à 0,15×
    boss: { duration: 0.12, scale: 0.1 }, // boss : 120 ms
    hurt: { duration: 0.06, scale: 0.3 }, // coup au joueur : 60 ms à 0,3×
    maxDuration: 0.12, // aucun hit-stop, même prolongé, ne dépasse 120 ms
    // Délai réel entre deux hit-stops. Borne le ralentissement global : à 400 ennemis (un kill par frame),
    // le temps de jeu avance à ≥ 88 % du temps réel au lieu de 15 % (observé en phase 1).
    cooldown: 0.25,
  },
  shake: {
    max: 0.6, // amplitude bornée (u)
    decay: 2, // par seconde
    hurt: 0.25,
    elite: 0.4,
    boss: 0.6,
    evolve: 0.5,
  },
  camera: {
    zoomOutAt15min: 0.08, // zoom-out progressif de 8 % de 0 à 15 min (le pouvoir se voit)
    bossPullback: 0.1, // recul de 10 % pendant un boss
  },
  squash: {
    jumpStretch: 1, // squash & stretch retiré à la demande de Jimmy (iPhone : « écrasé ou étiré ») ; 1,08 dans le skill
    landSquash: 1, // idem (0,85 dans le skill) : 1 désactive le ressort d'atterrissage
    landSpring: 0.12, // ressort amorti (s)
    shootR: 0.14, // tir : (1+r, 1−0,8r, 1+r), r de 0,14 → 0 en 140 ms (porté par Player.recoil côté sim)
    enemyStretch: 1, // idem (1,1 dans le skill)
    hitScale: 1, // idem (1,18 dans le skill) : le coup se lit au flash blanc, aux particules et au chiffre
    gemPop: 0.12, // apparition des gemmes 0 → 1,3 → 1 en 120 ms
  },
  particles: {
    cap: 500,
    hit: { n: 5, speed: 3.5, up: 3 },
    crit: { n: 6, speed: 5, up: 4 }, // phase 23 : gerbe dorée d'un coup critique
    kill: { n: 7, speed: 5, up: 7 },
    elite: { n: 50, speed: 8, up: 9 },
    land: { n: 6, speed: 1.5, up: 3 },
    shoot: { n: 3, speed: 3, up: 2 },
    levelUp: { n: 30, speed: 5, up: 6 },
  },
  trail: {
    hurtBlink: 1.5, // s après un coup pendant lesquelles l'invulnérabilité fait clignoter le joueur (pas celle d'un sort)
    whirlEvery: 1 / 60, // s entre deux salves de particules du Tourbillon (débit indépendant de l'écran)
    projGhosts: 4, // fantômes à t − j·28 ms
    projGhostDt: 0.028,
    dashGhosts: 6, // silhouettes du joueur
    dashGhostEvery: 0.03, // s entre deux silhouettes
    dashGhostLife: 0.3,
    bladeGhosts: 3,
  },
  damageNumbers: {
    rise: 1.8, // u/s
    life: 0.6,
    popFor: 0.1, // scale 1,35 → 1 sur 100 ms
    fadeFor: 0.25,
    bigAbove: 40, // doré et plus gros
    mergeRadius: 1.5, // coups d'une même frame à < 1,5 u : un seul chiffre (somme)
  },
} as const;

/**
 * Hit-stop borné. La sim garde son pas fixe : seul le temps réel injecté dans l'accumulateur est ralenti,
 * le déterminisme est intact. Trois bornes : durée max par hit-stop, pas de relance pendant un hit-stop,
 * délai entre deux hit-stops. Ainsi des kills à chaque frame ne figent plus le chrono.
 */
export class HitStop {
  timeScale = 1;
  enabled = true;
  private t = 0; // reste du hit-stop en cours (s réelles)
  private elapsed = 0; // durée déjà consommée par le hit-stop en cours
  private cd = 0; // délai avant le prochain

  get active(): boolean {
    return this.t > 0;
  }

  /**
   * Demande un hit-stop. `priority` : 0 = ordinaire (kill ; refusé pendant un hit-stop ou le délai),
   * 1 = prolonge un hit-stop en cours mais respecte le délai (joueur touché : émis à chaque frame de contact),
   * 2 = toujours accepté (boss : événement ponctuel). Toute durée est bornée par `maxDuration`.
   */
  request(duration: number, scale: number, priority: 0 | 1 | 2 = 0): void {
    if (!this.enabled) return;
    const H = FEEL.hitStop;
    if (this.t > 0) {
      if (priority === 0) return;
      // prolonge jusqu'à `duration` depuis le début (priorité 1) ou jusqu'à la durée max (priorité 2)
      const cap = (priority === 1 ? Math.min(duration, H.maxDuration) : H.maxDuration) - this.elapsed;
      this.t = Math.max(this.t, Math.min(cap, duration));
      this.timeScale = Math.min(this.timeScale, scale);
      return;
    }
    if (priority < 2 && this.cd > 0) return;
    this.t = Math.min(duration, H.maxDuration);
    this.elapsed = 0;
    this.timeScale = scale;
  }

  /** Avance de `dt` secondes réelles ; retourne le temps de jeu à injecter dans l'accumulateur. */
  advance(dt: number): number {
    if (this.t > 0) {
      const slow = Math.min(dt, this.t);
      this.t -= slow;
      this.elapsed += slow;
      const out = slow * this.timeScale + (dt - slow);
      if (this.t <= 0) {
        this.t = 0;
        this.timeScale = 1;
        this.cd = FEEL.hitStop.cooldown;
      }
      return out;
    }
    if (this.cd > 0) this.cd -= dt;
    return dt;
  }

  reset(): void {
    this.t = this.elapsed = this.cd = 0;
    this.timeScale = 1;
  }
}
