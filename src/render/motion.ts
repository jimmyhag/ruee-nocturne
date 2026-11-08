// Mouvements du héros à l'écran (phase 29) : choix de l'animation de fond, durée des fondus, cadence de course,
// inclinaison du corps et décision de jouer la réception. Logique pure (aucun import de three), lue depuis l'état de
// la sim à chaque image, sans allocation. Retour de Jimmy : « les animations des mécaniques de mouvement, faut les
// rendre plus propres » — sur une piste à bosses, le héros alternait chute et réception au lieu de glisser.

/** Animation de fond (le rendu la traduit en clip : Idle, Run, Slide, Jump_Idle). */
export const enum Base {
  Idle,
  Run,
  Slide,
  Fall,
}

export const MOTION = {
  airDelay: 0.15, // s en l'air avant de passer en pose de chute (une bosse ne fait pas « tomber »)…
  airHigh: 0.6, // …ou plus haut que ça au-dessus du sol
  slideAirMax: 1.2, // en l'air avec l'élan de glisse : pose de glisse tant qu'on est sous cette hauteur…
  slideAirLong: 0.45, // …ou que le vol est court ; un long envol de tremplin passe en pose de vol
  landAir: 0.35, // la réception (clip Land) ne se joue qu'après ce temps en l'air…
  landSpeed: 2, // …et presque à l'arrêt (u/s) : en courant ou en glissant, on enchaîne sans s'accroupir
  runOn: 0.8, // u/s : la course démarre au-dessus…
  runOff: 0.35, // …et s'arrête en dessous (hystérésis : pas d'aller-retour course/repos)
  fadeSlideIn: 0.08, // s de fondu vers la glisse (vif)
  fadeSlideOut: 0.22, // de la glisse au sol (on se relève)
  fadeRun: 0.2, // course ↔ repos
  fadeFall: 0.12, // vers la chute
  fadeLand: 0.1, // de la chute au sol
  runRef: 6.2, // u/s pour une cadence ×1 du clip de course
  runMin: 0.75, // cadence bornée : la foulée ne s'emballe pas en sortie de glisse
  runMax: 1.35,
  rollGain: 0.06, // rad de roulis par rad/s de virage (on se penche dans le virage)…
  rollMax: 0.16,
  pitchGain: 0.012, // rad de tangage par u/s² d'accélération (on se penche en démarrant)…
  pitchMax: 0.12,
  slopeK: 0.8, // en glisse, le corps suit la pente à 80 %
  spring: 10, // 1/s : lissage de l'inclinaison
};

export interface MotionInput {
  onGround: boolean;
  sliding: boolean;
  airMom: boolean;
  /** élan venu d'un saut depuis la glisse (1.24.1 : animation normale, réception debout), pas d'un envol */
  slideJump: boolean;
  /** hauteur au-dessus du sol (u) */
  height: number;
  /** vitesse horizontale (u/s) */
  speed: number;
  /** orientation du héros (rad) */
  face: number;
  /** pente du sol dans le sens de la marche et vers la gauche du héros (dh/du) */
  slopeAlong: number;
  slopeLat: number;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

export class MotionState {
  base: Base = Base.Idle;
  /** fondu à utiliser pour atteindre `base` (s) */
  fade = 0;
  /** cadence du clip de course */
  runScale = 1;
  /** inclinaison du corps (rad) : tangage (vers l'avant +) et roulis */
  pitch = 0;
  roll = 0;
  /** temps passé en l'air depuis le dernier contact (s) */
  airT = 0;
  private running = false;
  private prevSpeed = 0;
  private prevFace = 0;
  private faceRate = 0;
  private accel = 0;
  private started = false;

  /** Remise à zéro (nouvelle partie, menu). */
  reset(): void {
    this.base = Base.Idle;
    this.fade = 0;
    this.pitch = this.roll = this.airT = 0;
    this.running = false;
    this.started = false;
  }

  /** La réception mérite-t-elle le clip Land ? À appeler quand la sim signale l'atterrissage. */
  shouldLand(sliding: boolean, speed: number): boolean {
    return this.airT > MOTION.landAir && !sliding && speed < MOTION.landSpeed;
  }

  update(dt: number, s: MotionInput): void {
    const M = MOTION;
    if (dt <= 0) return;
    // vitesses dérivées, lissées (virage et accélération)
    if (!this.started) {
      this.prevFace = s.face;
      this.prevSpeed = s.speed;
      this.started = true;
    }
    let df = s.face - this.prevFace;
    df = Math.atan2(Math.sin(df), Math.cos(df));
    this.prevFace = s.face;
    const k = 1 - Math.exp(-M.spring * dt);
    this.faceRate += (df / dt - this.faceRate) * k;
    this.accel += ((s.speed - this.prevSpeed) / dt - this.accel) * k;
    this.prevSpeed = s.speed;

    // course : hystérésis
    if (s.speed > M.runOn) this.running = true;
    else if (s.speed < M.runOff) this.running = false;
    const ground = this.running ? Base.Run : Base.Idle;

    // fond voulu
    let next: Base;
    if (s.onGround) {
      next = s.sliding ? Base.Slide : ground;
    } else {
      this.airT += dt;
      // en l'air après un envol en glisse : pose de glisse ; après un saut, animation normale (le saut annule la glisse)
      if (s.airMom && !s.slideJump && (s.height < M.slideAirMax || this.airT < M.slideAirLong)) next = Base.Slide;
      else if (this.airT > M.airDelay || s.height > M.airHigh) next = Base.Fall;
      else next = this.base === Base.Fall ? Base.Fall : this.base; // petit saut de bosse : on garde la pose
    }
    if (s.onGround) this.airT = 0;
    if (next !== this.base) {
      this.fade =
        next === Base.Slide
          ? M.fadeSlideIn
          : this.base === Base.Slide
            ? M.fadeSlideOut
            : next === Base.Fall
              ? M.fadeFall
              : this.base === Base.Fall
                ? M.fadeLand
                : M.fadeRun;
      this.base = next;
    }
    this.runScale = clamp(s.speed / M.runRef, M.runMin, M.runMax);

    // inclinaison voulue : dans le virage et à l'accélération au sol ; en glisse, le long de la pente
    let pT = 0,
      rT = 0;
    if (s.onGround && s.speed > 0.5) {
      const v = Math.min(1, s.speed / M.runRef);
      rT = clamp(-this.faceRate * M.rollGain, -M.rollMax, M.rollMax) * v;
      pT = clamp(this.accel * M.pitchGain, -M.pitchMax * 0.5, M.pitchMax);
      if (s.sliding) {
        pT = -Math.atan(s.slopeAlong) * M.slopeK;
        rT += Math.atan(s.slopeLat) * M.slopeK;
      }
    }
    this.pitch += (pT - this.pitch) * k;
    this.roll += (rT - this.roll) * k;
  }
}
