// Partie guidée (docs/specs/tutoriel.md, UI & Layout Contract) : la bulle de consigne en haut au centre (une ligne, la
// commande selon l'appareil), la flèche vers le lieu montré, le bouton tactile mis en valeur et les ralentis. L'automate
// vit dans src/meta/guide.ts ; ici, seulement l'affichage. Les nœuds sont ceux de index.html (créés une fois) ; les
// textes ne sont réécrits qu'au changement d'étape ou de consigne, la flèche seulement quand elle bouge d'un cran
// (aucune allocation par image en régime permanent).
import {
  GESTURE_STEPS,
  HINTS,
  hintRank,
  STEPS,
  Step,
  guideForced,
  guideTarget,
  guideTotemWait,
  updateGuide,
} from '../meta/guide';
import type { GuideState, Hint } from '../meta/guide';
import { has, t } from '../i18n';
import { keyText, moveText } from './keys';
import type { KeyBinds } from '../platform/keymap';
import type { World } from '../sim/world';

export const TUTO_FEEL = {
  slow: 0.3, // ralenti (décision 2) : × le temps réel injecté dans la boucle (le pas fixe ne change pas)
  slowJump: 2.5, // s réelles : l'onde à franchir de l'étape du saut
  slowHint: 1.6, // s réelles : un danger (boss de survie), à sa première apparition
  hint: 5, // s réelles d'affichage d'une consigne de première apparition
  forceMs: 4000, // ms : bannière « Va activer le totem rouge » au moment où elle commence
  edge: 44, // px : marge de la flèche au bord de l'écran
  above: 56, // px : la flèche se pose au-dessus du lieu quand il est à l'écran
  wave: 1.2, // s réelles entre deux ondes au sol de l'étape du saut
};

/** Ce dont la vue a besoin du jeu (main.ts), sans le connaître. */
export interface TutorialHost {
  isTouch(): boolean;
  binds(): KeyBinds;
  /** Projette un point du monde à l'écran : NDC dans out (x, y ∈ [-1, 1] à l'écran ; z > 1 derrière la caméra). */
  project(x: number, y: number, z: number, out: { x: number; y: number; z: number }): boolean;
  /** Consigne de première apparition montrée : à retenir dans la méta (une fois par joueur). */
  hintShown(h: Hint): void;
  /** Le totem devient obligatoire (8:00) : bannière. */
  forced(): void;
  /** Ondes visibles (rendu) pour l'étape du saut. */
  wave(w: World): void;
}

const HL_OF: Partial<Record<Step, string>> = {
  [Step.Move]: 'stick',
  [Step.Jump]: 'btnJump',
  [Step.Slide]: 'btnSlide',
  [Step.SlideJump]: 'btnSlide',
  [Step.Spell]: 'btnSpell',
};

export class TutorialView {
  g: GuideState | null = null;
  private readonly box = document.getElementById('tuto') as HTMLElement;
  private readonly cmd = document.getElementById('tutoCmd') as HTMLElement;
  private readonly txt = document.getElementById('tutoText') as HTMLElement;
  private readonly arrow = document.getElementById('tutoArrow') as HTMLElement;
  private dirty = true;
  private hintKey = -1;
  private hintT = 0;
  private slowT = 0;
  private wasForced = false;
  private waiting = false; // décision 15 : sur le totem du monde avant son tour (« Pas encore »)
  private waveT = 0;
  private hl: HTMLElement | null = null;
  private readonly at = { x: 0, z: 0 };
  private readonly scr = { x: 0, y: 0, z: 0 };
  private ax = -1e9;
  private ay = -1e9;
  private aa = -1e9;
  private onTarget = false;
  private shownNow = false;
  private stage = 0;
  private vis = true;
  private shownStep = -1;
  constructor(private readonly host: TutorialHost) {}

  /** Début (ou reprise) d'une partie : le guide de cette partie. */
  start(g: GuideState, w: World): void {
    this.g = g;
    this.hintKey = -1;
    this.hintT = this.slowT = this.waveT = 0;
    this.wasForced = guideForced(g, w);
    this.waiting = false;
    this.stage = w.stage;
    this.shownStep = g.step; // une partie reprise à l'étape du saut ne repart pas au ralenti
    this.dirty = true;
  }
  stop(): void {
    this.g = null;
    this.shownNow = false;
    this.box.hidden = true;
    this.arrow.hidden = true;
    this.highlight(null);
  }
  /** Ralenti en cours (« Effets réduits » le coupe, décision 12) : facteur du temps réel injecté dans la boucle. */
  timeScale(reduced: boolean): number {
    return this.slowT > 0 && !reduced ? TUTO_FEEL.slow : 1;
  }
  /** Saut d'étape (crochets de débogage, changement de langue) : textes à réécrire. */
  refresh(): void {
    this.dirty = true;
  }

  /** Après chaque pas de la sim (ses événements sont encore dans w.events) ; dt = temps de jeu du pas. */
  step(w: World, dt: number): void {
    const g = this.g;
    if (!g) return;
    updateGuide(g, w, dt); // le changement d'étape est vu à l'image suivante (frame)
    if (g.hint >= 0) {
      // deux consignes au même moment (le portail et le bonus que lâche le boss) : la plus importante reste affichée,
      // l'autre attend sa prochaine apparition
      if (this.hintT > 0 && hintRank(this.hintKey) > hintRank(g.hint)) {
        g.hints &= ~(1 << g.hint);
        g.hint = -1;
        return;
      }
      this.hintKey = g.hint;
      this.hintT = TUTO_FEEL.hint;
      this.stage = w.stage;
      // 1.69.0 : le portail s'explique dans une fenêtre en pause (main.ts : openInfo), sans ralenti
      if (HINTS[g.hint] === 'survival') this.slowT = TUTO_FEEL.slowHint;
      this.host.hintShown(g.hint);
      g.hint = -1;
      this.dirty = true;
    }
  }

  /** À chaque image : minuteries, textes (au changement seulement) ; la flèche suit après le rendu (`arrowFrame`). `shown` : la partie est à l'écran, en jeu. */
  frame(w: World, realDt: number, shown: boolean): void {
    const g = this.g;
    if (!g) return;
    if (g.step !== this.shownStep) {
      // nouvelle étape (franchie, sautée au débogage, ou partie reprise) : textes, et l'onde du saut au ralenti
      this.shownStep = g.step;
      this.dirty = true;
      if (g.step === Step.Jump) {
        this.slowT = TUTO_FEEL.slowJump;
        this.waveT = 0;
      }
    }
    if (this.slowT > 0) this.slowT -= realDt;
    if (this.hintT > 0) {
      this.hintT -= realDt;
      if (this.hintT <= 0) this.dirty = true;
    }
    const forced = guideForced(g, w);
    if (forced !== this.wasForced) {
      this.wasForced = forced;
      this.dirty = true;
      if (forced) this.host.forced();
    }
    const waiting = guideTotemWait(g, w);
    if (waiting !== this.waiting) {
      this.waiting = waiting;
      this.dirty = true;
    }
    // étape du saut : une onde au sol vers le joueur, toutes les 1,2 s, tant qu'il n'a pas sauté
    if (g.step === Step.Jump && shown) {
      this.waveT -= realDt;
      if (this.waveT <= 0) {
        this.waveT = TUTO_FEEL.wave;
        this.host.wave(w);
      }
    }
    if (this.dirty) this.render(g);
    const on = shown && !this.box.hidden;
    if (shown !== this.vis) {
      this.vis = shown;
      this.box.style.visibility = shown ? '' : 'hidden';
    }
    this.shownNow = shown;
    if (!on && this.hl) this.highlight(null);
  }

  /**
   * Texte affiché : la consigne obligatoire, sinon « Pas encore » sur le totem du monde avant son tour, sinon une consigne
   * de première apparition, sinon l'étape.
   */
  private render(g: GuideState): void {
    this.dirty = false;
    let text = '',
      cmd = '',
      hl: Step | -1 = -1;
    if (this.wasForced) text = t('tuto.force');
    else if (this.waiting) text = t('tuto.totemWait');
    else if (this.hintT > 0 && this.hintKey >= 0) {
      const k = 'tuto.hint.' + HINTS[this.hintKey];
      text = has(k) ? t(k, { n: this.stage + 1 }) : '';
    } else if (g.tutorial && g.step !== Step.Free && g.step !== Step.Cards) {
      text = t('tuto.step.' + STEPS[g.step]);
      if (GESTURE_STEPS.includes(g.step)) {
        cmd = this.command(g.step);
        hl = g.step;
      }
    }
    this.txt.textContent = text;
    this.cmd.textContent = cmd;
    this.box.hidden = text === '';
    this.highlight(hl >= 0 && this.host.isTouch() ? (document.getElementById(HL_OF[hl as Step] ?? '') ?? null) : null);
  }

  /** La commande du geste : le bouton au doigt, la touche (réglages de touches) au clavier (règle 4). */
  private command(s: Step): string {
    const touch = this.host.isTouch(),
      b = this.host.binds();
    switch (s) {
      case Step.Move:
        return touch ? t('tuto.cmd.stick') : moveText(b);
      case Step.Jump:
        return touch ? t('touch.jump') : keyText(b, 'jump');
      case Step.Slide:
        return touch ? t('touch.slide') : keyText(b, 'slide');
      case Step.SlideJump:
        return touch ? `${t('touch.slide')} + ${t('touch.jump')}` : `${keyText(b, 'slide')} + ${keyText(b, 'jump')}`;
      case Step.Spell:
        return touch ? (document.getElementById('spellName')?.textContent ?? t('touch.spell')) : keyText(b, 'spell');
      default:
        return '';
    }
  }

  private highlight(el: HTMLElement | null): void {
    if (el === this.hl) return;
    this.hl?.classList.remove('tuto-hl');
    el?.classList.add('tuto-hl');
    this.hl = el;
  }

  /**
   * Flèche : au-dessus du lieu quand il est à l'écran, sinon au bord, tournée vers lui. Écrite seulement si elle bouge.
   * Appelée après le rendu de la scène, avec la caméra de l'image (comme les chiffres de dégâts).
   */
  arrowFrame(w: World, width: number, height: number): void {
    const g = this.g;
    if (!g) return;
    const A = this.arrow;
    if (
      !this.shownNow ||
      !guideTarget(g, w, this.at) ||
      !this.host.project(this.at.x, w.heightAt(this.at.x, this.at.z) + 1, this.at.z, this.scr)
    ) {
      if (!A.hidden) A.hidden = true;
      return;
    }
    let nx = this.scr.x,
      ny = this.scr.y;
    if (this.scr.z > 1) {
      nx = -nx; // derrière la caméra : la direction s'inverse
      ny = -ny;
    }
    const F = TUTO_FEEL;
    let px: number, py: number, ang: number;
    const inside = this.scr.z <= 1 && Math.abs(nx) < 0.9 && Math.abs(ny) < 0.85;
    if (inside) {
      px = ((nx + 1) / 2) * width;
      py = ((1 - ny) / 2) * height - F.above;
      ang = 180; // pointe vers le bas, sur le lieu
    } else {
      // au bord : sur le rectangle intérieur, dans la direction du lieu depuis le centre de l'écran
      const dx = nx * (width / 2),
        dy = -ny * (height / 2);
      const hw = width / 2 - F.edge,
        hh = height / 2 - F.edge;
      const k = Math.min(hw / Math.max(1e-6, Math.abs(dx)), hh / Math.max(1e-6, Math.abs(dy)));
      px = width / 2 + dx * k;
      py = height / 2 + dy * k;
      ang = (Math.atan2(dx, -dy) * 180) / Math.PI;
    }
    px = Math.round(px / 2) * 2;
    py = Math.round(py / 2) * 2;
    ang = Math.round(ang / 3) * 3;
    if (A.hidden) A.hidden = false;
    if (px === this.ax && py === this.ay && ang === this.aa) return;
    this.ax = px;
    this.ay = py;
    this.aa = ang;
    A.style.transform = `translate(${px}px,${py}px) rotate(${ang}deg)`;
    if (inside !== this.onTarget) {
      this.onTarget = inside;
      A.classList.toggle('on-target', inside);
    }
  }
}
