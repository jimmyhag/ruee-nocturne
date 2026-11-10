import type { Input } from '../sim/types';

/** Fusionne clavier, joystick tactile et manette en un Input normalisé par step. */
/** Le focus est dans un champ de saisie : le clavier appartient au champ, pas au jeu. */
function isEditable(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}

/**
 * 1.37.1 (retour de Jimmy) : après une pause (menu, montée de niveau, coffre, marchand), on continue dans la dernière
 * direction tant que le joueur n'a pas repris la main (doigt reposé, touche, manette), au plus CARRY_MS. Au doigt, on
 * lève forcément le pouce pour toucher une carte : sans ça, le héros restait planté à la reprise.
 */
const CARRY_MS = 3000;

export class InputManager {
  private keys: Record<string, boolean> = {};
  private lastX = 0; // direction du dernier pas joué (avant la pause)
  private lastZ = 0;
  private carryX = 0;
  private carryZ = 0;
  private carryUntil = 0; // performance.now() de fin de l'élan conservé
  private jumpQueued = false;
  private spellQueued = false;
  private pickQueued = -1;
  joy = { id: -1, active: false, ox: 0, oy: 0, x: 0, y: 0 };
  isTouch = matchMedia('(pointer: coarse)').matches;
  onTouchDetected: (() => void) | null = null;
  onPause: (() => void) | null = null;
  onConfirm: (() => void) | null = null;
  gamepadUsed = false;

  /** Phase 27 : appui sur GLISSE au doigt, transmis à la sim pendant un pas (elle ne lit que le front montant). */
  private slideQueued = false;
  private prevSlide = false; // glisse envoyée au pas précédent
  private padSlide = false;

  constructor(
    stick: HTMLElement,
    knob: HTMLElement,
    jumpBtn: HTMLElement,
    spellBtn: HTMLElement,
    slideBtn?: HTMLElement,
  ) {
    addEventListener('keydown', (e) => {
      if (isEditable(e.target)) return; // champ texte (compte, sauvegarde) : Espace, Entrée et chiffres restent au navigateur
      this.keys[e.code] = true;
      if (e.repeat) return;
      if (/^Digit[1-4]$/.test(e.code)) this.pickQueued = +e.code.slice(5) - 1;
      if (e.code === 'Space') {
        e.preventDefault();
        this.jumpQueued = true;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.spellQueued = true;
      if (e.code === 'KeyC') this.slideQueued = true; // phase 27 : un tapotement plus court qu'un pas compte aussi
      if (e.code === 'Escape' || e.code === 'KeyP') this.onPause?.();
      if (e.code === 'Enter') this.onConfirm?.();
    });
    addEventListener('keyup', (e) => (this.keys[e.code] = false));
    addEventListener('blur', () => {
      for (const k in this.keys) this.keys[k] = false;
    });

    const hold = (el: HTMLElement, fn: () => void) =>
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        fn();
      });
    hold(jumpBtn, () => (this.jumpQueued = true));
    hold(spellBtn, () => (this.spellQueued = true));
    if (slideBtn) hold(slideBtn, () => (this.slideQueued = true));

    addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') return;
      if (!this.isTouch) {
        this.isTouch = true;
        this.onTouchDetected?.();
      }
      if (this.joy.id !== -1 || (e.target as HTMLElement).closest('button, .screen')) return;
      this.joy.id = e.pointerId;
      this.joy.active = true;
      this.carryUntil = 0; // le doigt est revenu : il reprend la main
      this.joy.ox = e.clientX;
      this.joy.oy = e.clientY;
      this.joy.x = this.joy.y = 0;
      stick.style.left = e.clientX + 'px';
      stick.style.top = e.clientY + 'px';
      knob.style.transform = '';
      stick.classList.add('on');
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joy.id) return;
      let dx = e.clientX - this.joy.ox,
        dy = e.clientY - this.joy.oy;
      const d = Math.sqrt(dx * dx + dy * dy),
        R = 52;
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      this.joy.x = dx / R;
      this.joy.y = dy / R;
      knob.style.transform = `translate(${dx}px,${dy}px)`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.id = -1;
      this.joy.active = false;
      this.joy.x = this.joy.y = 0;
      stick.classList.remove('on');
    };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
    // Bloque le défilement et le zoom tactiles sur le jeu (canvas, joystick, boutons) : le viewport n'a plus
    // user-scalable=no, c'est touch-action: none plus ces écouteurs qui s'en chargent. Les écrans (.screen : menu,
    // réglages, boutique, succès, niveau, mort) doivent, eux, défiler au doigt : on n'y annule que le pincement.
    document.addEventListener(
      'touchmove',
      (e) => {
        const inScreen = (e.target as Element | null)?.closest?.('.screen');
        if (!inScreen || e.touches.length > 1) e.preventDefault();
      },
      { passive: false },
    );
    document.addEventListener('gesturestart', (e) => e.preventDefault()); // pincement Safari (événement propriétaire)
  }

  private prevPadButtons = { jump: false, spell: false, pause: false, pick: -1 };

  /** Reprise du jeu après une pause : garde l'élan du dernier pas si plus rien n'est tenu (voir CARRY_MS). */
  resume(): void {
    this.carryX = this.lastX;
    this.carryZ = this.lastZ;
    this.carryUntil = this.lastX !== 0 || this.lastZ !== 0 ? performance.now() + CARRY_MS : 0;
  }

  /** Remplit `out` pour ce step et consomme les fronts montants. */
  poll(out: Input): void {
    let mx = 0,
      mz = 0;
    const k = this.keys;
    if (k.KeyA || k.KeyQ || k.ArrowLeft) mx -= 1;
    if (k.KeyD || k.ArrowRight) mx += 1;
    if (k.KeyW || k.KeyZ || k.ArrowUp) mz -= 1;
    if (k.KeyS || k.ArrowDown) mz += 1;
    if (this.joy.active) {
      mx += this.joy.x;
      mz += this.joy.y;
    }
    // manette : premier pad connecté
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const pad = pads && pads[0];
    if (pad) {
      const ax = pad.axes[0] ?? 0,
        ay = pad.axes[1] ?? 0;
      if (Math.abs(ax) > 0.2 || Math.abs(ay) > 0.2) {
        mx += ax;
        mz += ay;
        this.gamepadUsed = true;
      }
      const b = (i: number) => !!pad.buttons[i]?.pressed;
      if (b(0) && !this.prevPadButtons.jump) this.jumpQueued = true; // A
      if ((b(1) || b(5) || b(7)) && !this.prevPadButtons.spell) this.spellQueued = true; // B / RB / RT
      if (b(9) && !this.prevPadButtons.pause) this.onPause?.();
      // cartes : A=1, X=2, Y=3 en mode level-up (gérées par l'UI via pick)
      const pick = b(2) ? 1 : b(3) ? 2 : -1;
      if (pick >= 0 && this.prevPadButtons.pick !== pick) this.pickQueued = pick;
      this.padSlide = b(2) || b(4); // X / LB tenus : glisse (phase 27)
      this.prevPadButtons.jump = b(0);
      this.prevPadButtons.spell = b(1) || b(5) || b(7);
      this.prevPadButtons.pause = b(9);
      this.prevPadButtons.pick = pick;
    }
    if (mx !== 0 || mz !== 0)
      this.carryUntil = 0; // une vraie commande remplace l'élan
    else if (this.carryUntil > 0 && performance.now() < this.carryUntil) {
      mx = this.carryX;
      mz = this.carryZ;
    }
    this.lastX = mx;
    this.lastZ = mz;
    out.mx = mx;
    out.mz = mz;
    out.jump = this.jumpQueued;
    out.spell = this.spellQueued;
    // glisse : la sim ne compte que le front montant. Relâcher puis réappuyer entre deux pas laissait le signal à vrai
    // (aucun front : le second appui ne relevait pas le joueur, CI 1.23.0) ; un nouvel appui alors que le pas précédent
    // voyait la touche tenue passe d'abord par un pas « relâché », puis l'appui arrive au pas suivant (16 ms).
    if (this.slideQueued && this.prevSlide) out.slide = false;
    else {
      out.slide = !!k.KeyC || this.padSlide || this.slideQueued;
      this.slideQueued = false;
    }
    this.prevSlide = out.slide;
    out.pick = this.pickQueued;
    this.jumpQueued = this.spellQueued = false;
    this.pickQueued = -1;
  }

  /** En mode level-up : index de carte demandé au clavier (1-4) ou à la manette, −1 sinon. Consomme la demande. */
  takePick(): number {
    const p = this.pickQueued;
    this.pickQueued = -1;
    return p;
  }

  /** En mode level-up, « saut » (A / Espace) vaut « carte 1 ». */
  takePickFromJump(): boolean {
    if (this.jumpQueued) {
      this.jumpQueued = false;
      return true;
    }
    return false;
  }
}
