// Audio procédural Web Audio : 3 bus (SFX −6 dB, UI −8 dB, musique −12 dB), limiteur, pool de 24 voix à priorité.
// Aucun fichier à charger. Pas de musique : la musique procédurale à 3 couches (nappe, rythme, intensité) a été
// retirée à la demande de Jimmy (« pas ouf ») ; le bus musique reste pour de vraies pistes CC0 en phase 5.

/** Priorité d'une voix (skill game-feel §7) : joueur touché > niveau > boss > kill > hit > ramassage. */
const PRIO = { hurt: 6, levelUp: 5, boss: 4, kill: 3, move: 3, hit: 2, pickup: 1, shoot: 0, ui: 5 } as const;
const MAX_VOICES = 24;
const HIT_VARIANTS: { f: number; type: OscillatorType }[] = [
  { f: 190, type: 'square' },
  { f: 230, type: 'triangle' },
  { f: 160, type: 'square' },
  { f: 210, type: 'sawtooth' },
];
const CARD_SOUNDS: Record<'w' | 'wnew' | 's' | 'heal', { f: number; slide: number; type: OscillatorType }> = {
  wnew: { f: 523, slide: 523, type: 'triangle' }, // nouvelle arme : octave montante
  w: { f: 440, slide: 220, type: 'square' },
  s: { f: 392, slide: 120, type: 'triangle' },
  heal: { f: 660, slide: 0, type: 'sine' },
};

interface Voice {
  osc: OscillatorNode | null;
  prio: number;
  end: number; // currentTime de fin ; ≤ now ⇒ libre
}

export class AudioBus {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ui!: GainNode;
  private music!: GainNode;
  private slots: Voice[] = [];
  muted = false;
  /** Voix SFX actives (onglet perf, tests : ne doit jamais dépasser maxVoices). */
  get voiceCount(): number {
    if (!this.ctx) return 0;
    const t = this.ctx.currentTime;
    let n = 0;
    for (let i = 0; i < MAX_VOICES; i++) if (this.slots[i].end > t) n++;
    return n;
  }
  get maxVoices(): number {
    return MAX_VOICES;
  }
  private lastGem = 0;
  private gemCombo = 0;
  private hitAcc = 0;
  private lastHitSound = 0;
  private killTimes = new Float64Array(8); // instants des derniers kills (anneau) : combo ≥ 5 en 1 s
  private killIdx = 0;
  private lastCombo = 0;

  constructor() {
    for (let i = 0; i < MAX_VOICES; i++) this.slots.push({ osc: null, prio: 0, end: 0 });
  }

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const C =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new C();
    } catch {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    const comp = c.createDynamicsCompressor(); // limiteur sur le master
    comp.threshold.value = -12;
    comp.ratio.value = 8;
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.connect(comp);
    this.sfx = c.createGain();
    this.sfx.gain.value = 0.5; // −6 dB
    this.ui = c.createGain();
    this.ui.gain.value = 0.4; // −8 dB
    this.music = c.createGain();
    this.music.gain.value = 0.25; // −12 dB
    this.sfx.connect(this.master);
    this.ui.connect(this.master);
    this.music.connect(this.master);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }
  /** Joue une note sur le pool : prend une voix libre, sinon coupe la moins prioritaire si `prio` est supérieure. */
  private tone(
    bus: GainNode,
    freq: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    slide = 0,
    prio = 0,
    delay = 0,
  ): void {
    if (!this.ctx || this.muted) return;
    const c = this.ctx,
      t = c.currentTime + delay;
    let slot = -1,
      worst = -1;
    for (let i = 0; i < MAX_VOICES; i++) {
      const v = this.slots[i];
      if (v.end <= c.currentTime) {
        slot = i;
        break;
      }
      if (worst < 0 || v.prio < this.slots[worst].prio) worst = i;
    }
    if (slot < 0) {
      if (this.slots[worst].prio >= prio) return;
      slot = worst;
      this.slots[slot].osc?.stop();
    }
    const o = c.createOscillator(),
      g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus);
    o.start(t);
    o.stop(t + dur + 0.02);
    const v = this.slots[slot];
    v.osc = o;
    v.prio = prio;
    v.end = t + dur + 0.02;
  }

  shoot(): void {
    this.tone(this.sfx, 880 + Math.random() * 80, 0.05, 'triangle', 0.12, -400, PRIO.shoot);
  }
  /** Coup porté : 4 variantes, hauteur ±8 %, volume selon dégâts. Au-delà de 12/s, un seul son plus fort. */
  hit(dmg: number, now: number): void {
    this.hitAcc += dmg;
    if (now - this.lastHitSound < 0.08) return;
    this.lastHitSound = now;
    const v = Math.min(0.25, 0.08 + this.hitAcc / 400);
    this.hitAcc = 0;
    const h = HIT_VARIANTS[(Math.random() * HIT_VARIANTS.length) | 0];
    this.tone(this.sfx, h.f * (0.92 + Math.random() * 0.16), 0.07, h.type, v, -120, PRIO.hit);
  }
  /** Kill ; en rafale (≥ 5 en 1 s) ajoute un son de combo + bref accord. */
  kill(boss = false, now = 0): void {
    if (boss) {
      this.tone(this.sfx, 220, 0.5, 'sawtooth', 0.4, 440, PRIO.boss);
      return;
    }
    this.tone(this.sfx, 130 + Math.random() * 30, 0.12, 'square', 0.18, -80, PRIO.kill);
    this.killTimes[this.killIdx] = now;
    this.killIdx = (this.killIdx + 1) % 8;
    if (now - this.lastCombo < 1.5) return;
    let recent = 0;
    for (let i = 0; i < 8; i++) if (now - this.killTimes[i] < 1) recent++;
    if (recent >= 5) {
      this.lastCombo = now;
      this.tone(this.sfx, 440, 0.2, 'triangle', 0.22, 220, PRIO.kill);
      this.tone(this.sfx, 660, 0.25, 'triangle', 0.16, 0, PRIO.kill, 0.05);
      this.tone(this.sfx, 880, 0.25, 'sine', 0.12, 0, PRIO.kill, 0.05);
    }
  }
  /** Ramassage : +1 demi-ton par gemme enchaînée (< 400 ms), reset après 14. */
  pickup(now: number): void {
    if (now - this.lastGem < 0.05) return;
    this.gemCombo = now - this.lastGem < 0.4 ? Math.min(this.gemCombo + 1, 14) : 0;
    this.lastGem = now;
    this.tone(this.sfx, 660 * Math.pow(1.0595, this.gemCombo), 0.07, 'triangle', 0.16, 0, PRIO.pickup);
  }
  /** Niveau : arpège montant 2 notes. */
  levelUp(): void {
    this.tone(this.ui, 523, 0.12, 'triangle', 0.3, 0, PRIO.levelUp);
    this.tone(this.ui, 784, 0.18, 'triangle', 0.3, 0, PRIO.levelUp, 0.09);
  }
  /** « Whoosh » à la reprise après le choix de carte. */
  whoosh(): void {
    this.tone(this.ui, 1400, 0.22, 'sawtooth', 0.14, -1100, PRIO.ui);
  }
  jump(): void {
    this.tone(this.sfx, 300, 0.14, 'square', 0.2, 260, PRIO.move);
  }
  dash(): void {
    this.tone(this.sfx, 500, 0.12, 'sawtooth', 0.15, -300, PRIO.move);
  }
  hurt(): void {
    this.tone(this.sfx, 90, 0.15, 'square', 0.35, -30, PRIO.hurt);
  }
  bolt(): void {
    this.tone(this.sfx, 140, 0.22, 'sawtooth', 0.2, -80, PRIO.hit);
  }
  boss(): void {
    this.tone(this.sfx, 70, 0.9, 'sawtooth', 0.45, -20, PRIO.boss);
  }
  death(): void {
    this.tone(this.ui, 200, 0.6, 'sawtooth', 0.4, -150, PRIO.hurt);
  }
  /** Coffre ramassé : arpège montant 3 notes. */
  chest(): void {
    this.tone(this.ui, 523, 0.1, 'triangle', 0.26, 0, PRIO.levelUp);
    this.tone(this.ui, 659, 0.1, 'triangle', 0.26, 0, PRIO.levelUp, 0.08);
    this.tone(this.ui, 784, 0.2, 'triangle', 0.3, 0, PRIO.levelUp, 0.16);
  }
  /** Évolution d'arme : accord grave + brillance. */
  evolve(): void {
    this.tone(this.ui, 110, 0.6, 'sawtooth', 0.35, 110, PRIO.levelUp);
    this.tone(this.ui, 440, 0.5, 'triangle', 0.3, 0, PRIO.levelUp, 0.1);
    this.tone(this.ui, 660, 0.5, 'triangle', 0.25, 0, PRIO.levelUp, 0.1);
    this.tone(this.ui, 1320, 0.4, 'sine', 0.2, 0, PRIO.levelUp, 0.2);
  }
  /** Rugissement du Gardien avant la charge. */
  roar(): void {
    this.tone(this.sfx, 60, 0.7, 'sawtooth', 0.45, 40, PRIO.boss);
    this.tone(this.sfx, 90, 0.5, 'square', 0.2, -30, PRIO.boss, 0.05);
  }
  /** Crachat du Cracheur (court, grave). */
  spit(): void {
    this.tone(this.sfx, 240, 0.08, 'square', 0.14, -120, PRIO.hit);
  }
  /** Plongée d'un Volant : sifflement descendant. */
  dive(): void {
    this.tone(this.sfx, 1200, 0.3, 'sine', 0.12, -700, PRIO.hit);
  }
  /** Lancer de boomerang. */
  throwSound(): void {
    this.tone(this.sfx, 700, 0.12, 'triangle', 0.14, -300, PRIO.shoot);
  }
  /** Explosion (mine, cercle du Colosse). */
  blast(): void {
    this.tone(this.sfx, 70, 0.25, 'square', 0.3, -40, PRIO.kill);
  }
  /** Sélection d'une carte : son distinct par type (nouvelle arme, arme, passif, soin). */
  select(kind: 'w' | 'wnew' | 's' | 'heal' = 'w'): void {
    const s = CARD_SOUNDS[kind];
    this.tone(this.ui, s.f, 0.09, s.type, 0.22, s.slide, PRIO.ui);
  }
}
