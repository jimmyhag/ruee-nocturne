// Audio Web Audio : 3 bus (SFX −6 dB, UI −8 dB, musique −12 dB), limiteur, pool de 24 voix à priorité.
// Phase 36 : bruitages enregistrés (Kenney CC0, Oculus Audio Pack CC BY 4.0) dans une seule planche, sfx.mp3, décodée
// une fois après le premier geste ; musiques HoliznaCC0 et ambiance de nuit lues en flux par des <audio> branchés sur le
// bus musique. Tant que la planche n'est pas là (hors ligne au premier lancement, échec réseau), les anciens sons
// synthétisés jouent : jamais de son muet. Rien n'est chargé avant le premier geste.
import SFX from './sfx.json';

type SfxKey = keyof typeof SFX.sounds;
/** Un son par bonus, dans l'ordre de Pw (Aimant, Pluie d'or, Élan, Temps figé, Rage). */
const POWER_SFX: readonly SfxKey[] = ['powerAimant', 'powerOr', 'powerVitesse', 'powerGel', 'powerRage'];
type TrackKey = keyof typeof SFX.tracks;
const AUDIO_URL = (file: string) => `${import.meta.env.BASE_URL}audio/${file}`;
/** Volumes des bus à plein réglage (−6, −8, −12 dB) ; les curseurs Effets et Musique les multiplient. */
const BUS = { sfx: 0.42, ui: 0.4, music: 0.25 }; // 1.31.1 : effets −1,5 dB

/** Priorité d'une voix (skill game-feel §7) : joueur touché > niveau > boss > kill > hit > ramassage. */
const PRIO = { hurt: 6, levelUp: 5, boss: 4, kill: 3, move: 3, hit: 2, pickup: 1, shoot: 0, ui: 5 } as const;
const MAX_VOICES = 24;
/**
 * 1.31.1 : sons secondaires (tirs, coups, ramassage : priorité < kill) refusés au-delà de 4 voix actives, kills et
 * mouvements au-delà de 7. Les sons enregistrés durent 0,2 à 0,6 s : sans ce plafond, une mêlée en empilait 15 à 20.
 */
const BUSY_MINOR = 4;
const BUSY_MID = 7;
const HEARD_EVERY = 0.8;
/** 1.31.1 : écart minimal (s) entre deux lectures d'un même son ; une rafale d'armes ne fait plus un mur de bruit. */
const MIN_GAP: Partial<Record<SfxKey, number>> = {
  orb: 0.2,
  lance: 0.18,
  blade: 0.28,
  bolt: 0.25,
  throw: 0.3,
  blast: 0.35,
  scythe: 0.25,
  arrow: 0.45,
  cast: 0.6,
  spit: 0.45,
  thud: 0.4,
  dive: 0.6,
  eruption: 0.35,
  land: 0.2,
  jump: 0.15,
  meteorWarn: 0.8,
};
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
  osc: AudioScheduledSourceNode | null;
  gain: GainNode | null; // pour couper une voix volée par un fondu de 5 ms plutôt qu'un clic
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
  private lastPlay: Partial<Record<SfxKey, number>> = {}; // dernière lecture de chaque son (currentTime)
  private killAcc = 0; // kills fusionnés dans le même son (rafale d'aura ou de météore)
  private lastKillSound = 0;
  private musicFailed = false; // navigateur sans MediaElementSource : on n'essaie plus
  private killTimes = new Float64Array(8); // instants des derniers kills (anneau) : combo ≥ 5 en 1 s
  private killIdx = 0;
  private lastCombo = 0;
  // phase 36 : bruitages enregistrés, musiques, volumes
  private buf: AudioBuffer | null = null;
  private loading = false;
  private sfxVol = 1;
  private musicVol = 0.7;
  private lowpass: BiquadFilterNode | null = null;
  private duckGain: GainNode | null = null;
  private tracks: Partial<Record<TrackKey, { el: HTMLAudioElement; gain: GainNode }>> = {};
  private wantTrack: 'menu' | 'game' | null = null;
  /** Planche de bruitages décodée (tests, onglet perf). */
  get samplesReady(): boolean {
    return this.buf !== null;
  }

  constructor() {
    for (let i = 0; i < MAX_VOICES; i++) this.slots.push({ osc: null, gain: null, prio: 0, end: 0 });
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
    // musique : bus → atténuation (pause, cartes) → passe-bas (étouffée pendant un menu) → master
    this.duckGain = c.createGain();
    this.lowpass = c.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.frequency.value = 20000;
    this.music.connect(this.duckGain);
    this.duckGain.connect(this.lowpass);
    this.lowpass.connect(this.master);
    this.applyVolumes();
    if (this.muted) this.master.gain.value = 0;
    void this.loadSamples();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
    for (const k in this.tracks) {
      const t = this.tracks[k as TrackKey];
      if (t && m) t.el.pause();
    }
    if (!m && this.wantTrack) this.setMusic(this.wantTrack); // l'ambiance de nuit repart avec la partie
  }
  /** Phase 36 : curseurs Effets et Musique (0 à 1). */
  setVolumes(sfx: number, music: number): void {
    this.sfxVol = Math.max(0, Math.min(1, sfx));
    this.musicVol = Math.max(0, Math.min(1, music));
    this.applyVolumes();
  }
  private applyVolumes(): void {
    if (!this.ctx) return;
    this.sfx.gain.value = BUS.sfx * this.sfxVol;
    this.ui.gain.value = BUS.ui * this.sfxVol;
    this.music.gain.value = BUS.music * this.musicVol * 4; // les pistes sont mixées à −18 LUFS : le bus les remet en retrait
  }
  /** Décode la planche de bruitages (une fois, après le premier geste). En cas d'échec, les sons synthétisés restent. */
  private async loadSamples(): Promise<void> {
    if (this.loading || !this.ctx) return;
    this.loading = true;
    try {
      const res = await fetch(AUDIO_URL(SFX.sfx));
      if (!res.ok) throw new Error(`sfx ${res.status}`);
      const data = await res.arrayBuffer();
      this.buf = await this.ctx.decodeAudioData(data);
    } catch (e) {
      console.warn('bruitages indisponibles, sons synthétisés', e);
      this.loading = false; // un nouvel essai au prochain geste
    }
  }

  /**
   * Appli en arrière-plan : contexte suspendu et musique en pause (batterie, pas de son hors de l'appli) ; au retour,
   * la musique voulue reprend.
   */
  background(hidden: boolean): void {
    const c = this.ctx;
    if (!c) return;
    if (hidden) {
      for (const k in this.tracks) this.tracks[k as TrackKey]?.el.pause();
      void c.suspend().catch(() => undefined);
    } else {
      void c.resume().catch(() => undefined);
      if (this.wantTrack) this.setMusic(this.wantTrack);
    }
  }

  // ---------- musique (phase 36) ----------
  /** Musique de fond : 'menu', 'game' ou null (silence) ; fondu enchaîné de 1,5 s. L'ambiance de nuit suit la partie. */
  setMusic(track: 'menu' | 'game' | null): void {
    this.wantTrack = track;
    if (!this.ctx || this.muted) return;
    const keys: TrackKey[] = ['menu', 'game', 'night'];
    for (const k of keys) {
      const on = k === track || (k === 'night' && track === 'game');
      if (on) this.playTrack(k);
      else this.fadeTrack(k, 0);
    }
  }
  private playTrack(k: TrackKey): void {
    const c = this.ctx;
    if (!c || this.musicFailed) return;
    let t = this.tracks[k];
    if (!t) {
      const el = new Audio(AUDIO_URL(SFX.tracks[k].file));
      el.loop = true;
      el.preload = 'auto';
      el.crossOrigin = 'anonymous';
      const gain = c.createGain();
      gain.gain.value = 0;
      try {
        c.createMediaElementSource(el).connect(gain);
      } catch {
        this.musicFailed = true; // navigateur sans MediaElementSource : pas de musique, le jeu continue
        return;
      }
      gain.connect(this.music);
      t = { el, gain };
      this.tracks[k] = t;
    }
    const level = k === 'night' ? 0.35 : 1;
    t.gain.gain.cancelScheduledValues(c.currentTime);
    t.gain.gain.setTargetAtTime(level, c.currentTime, 0.5);
    if (t.el.paused) void t.el.play().catch(() => undefined); // refusé hors geste : réessayé au prochain setMusic
  }
  private fadeTrack(k: TrackKey, level: number): void {
    const c = this.ctx,
      t = this.tracks[k];
    if (!c || !t) return;
    t.gain.gain.cancelScheduledValues(c.currentTime);
    t.gain.gain.setTargetAtTime(level, c.currentTime, 0.5);
    if (level === 0) {
      const el = t.el;
      setTimeout(() => {
        if (this.wantTrack !== k && !(k === 'night' && this.wantTrack === 'game')) el.pause();
      }, 2500);
    }
  }
  /** Pause, choix de carte, marchand : musique plus basse et étouffée ; `false` : retour progressif. */
  duck(on: boolean): void {
    const c = this.ctx;
    if (!c || !this.duckGain || !this.lowpass) return;
    this.duckGain.gain.setTargetAtTime(on ? 0.5 : 1, c.currentTime, 0.25);
    this.lowpass.frequency.setTargetAtTime(on ? 900 : 20000, c.currentTime, 0.25);
  }
  /** Phase 36 : état pour les tests (crochet de débogage). */
  get state(): { ctx: string; samples: boolean; music: string; sfx: number; musicGain: number } {
    return {
      ctx: this.ctx ? this.ctx.state : 'none',
      samples: this.buf !== null,
      music: this.musicPlaying,
      sfx: this.ctx ? this.sfx.gain.value : -1,
      musicGain: this.ctx ? this.music.gain.value : -1,
    };
  }
  /** Piste en cours (hors ambiance). */
  get musicPlaying(): string {
    for (const k in this.tracks) {
      const t = this.tracks[k as TrackKey];
      if (t && !t.el.paused && k !== 'night') return k;
    }
    return '';
  }

  /** Prend une voix du pool : libre, sinon la moins prioritaire si `prio` est supérieure ; -1 si refusé. */
  private voice(prio: number, ignoreBusy = false): number {
    const c = this.ctx!;
    let slot = -1,
      worst = -1,
      busy = 0;
    for (let i = 0; i < MAX_VOICES; i++) {
      const v = this.slots[i];
      if (v.end <= c.currentTime) {
        if (slot < 0) slot = i;
        continue;
      }
      busy++;
      if (worst < 0 || v.prio < this.slots[worst].prio) worst = i;
    }
    // 1.31.1 : mix aéré, les sons secondaires se taisent quand il y a déjà du monde
    if (!ignoreBusy && prio < PRIO.kill && busy >= BUSY_MINOR) return -1;
    if (!ignoreBusy && prio <= PRIO.kill && busy >= BUSY_MID) return -1;
    if (slot < 0) {
      if (this.slots[worst].prio >= prio) return -1;
      slot = worst;
      const v = this.slots[slot];
      try {
        v.gain?.gain.setTargetAtTime(0, c.currentTime, 0.005);
        v.osc?.stop(c.currentTime + 0.03);
      } catch {
        /* déjà arrêtée */
      }
    }
    return slot;
  }
  /**
   * Phase 36 : joue un bruitage enregistré (une variante au hasard, hauteur ±6 % × `rate`). Renvoie false si la planche
   * n'est pas chargée : l'appelant joue alors son ancien son synthétisé.
   */
  private sample(key: SfxKey, bus: GainNode, vol: number, prio: number, rate = 1, delay = 0, jitter = 0.06): boolean {
    if (!this.ctx || !this.buf) return false;
    if (this.muted) return true;
    const gap = MIN_GAP[key],
      last = this.lastPlay[key],
      since = last === undefined ? 1e9 : this.ctx.currentTime - last;
    if (gap !== undefined && since < gap) return true;
    // aucune arme muette : un son pas entendu depuis 0,8 s passe même dans une mêlée chargée
    const slot = this.voice(prio, since > HEARD_EVERY);
    if (slot < 0) return true;
    this.lastPlay[key] = this.ctx.currentTime;
    const vars = SFX.sounds[key];
    const seg = vars[(Math.random() * vars.length) | 0];
    const start = seg[0],
      dur = seg[1];
    const c = this.ctx,
      t = c.currentTime + delay;
    const src = c.createBufferSource(),
      g = c.createGain();
    src.buffer = this.buf;
    src.playbackRate.value = rate * (1 - jitter + Math.random() * 2 * jitter);
    g.gain.value = vol;
    src.connect(g);
    g.connect(bus);
    src.start(t, start, dur);
    const v = this.slots[slot];
    v.osc = src;
    v.gain = g;
    v.prio = prio;
    v.end = t + dur / src.playbackRate.value + 0.02;
    return true;
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
    const slot = this.voice(prio);
    if (slot < 0) return;
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
    v.gain = g;
    v.prio = prio;
    v.end = t + dur + 0.02;
  }

  shoot(): void {
    if (this.sample('orb', this.sfx, 0.7, PRIO.shoot)) return;
    this.tone(this.sfx, 880 + Math.random() * 80, 0.05, 'triangle', 0.12, -400, PRIO.shoot);
  }
  /** Phase 36 : estoc de la Lance. */
  lance(): void {
    if (this.sample('lance', this.sfx, 0.8, PRIO.shoot)) return;
    this.shoot();
  }
  /** Phase 36 : tranche des Lames (une par pas). */
  blade(): void {
    if (this.sample('blade', this.sfx, 0.75, PRIO.shoot)) return;
    this.throwSound();
  }
  /** Phase 36 : coup de Faux. */
  scythe(): void {
    if (this.sample('scythe', this.sfx, 0.85, PRIO.shoot)) return;
    this.throwSound();
  }
  /** Phase 36 : météore annoncé (sifflement qui tombe). */
  meteorWarn(): void {
    if (this.sample('meteorWarn', this.sfx, 0.4, PRIO.shoot)) return;
    this.spit();
  }
  /** Coup porté : variantes, hauteur ±6 %, volume selon dégâts. Au-delà de 12/s, un seul son plus fort. */
  hit(dmg: number, now: number): void {
    this.hitAcc += dmg;
    // 1.31.1 : au plus ~4 coups par seconde (avant 12) et pas juste après un kill, qui couvre déjà le coup
    if (now - this.lastHitSound < 0.22 || (now - this.lastKillSound < 0.08 && now >= this.lastKillSound)) return;
    this.lastHitSound = now;
    const v = Math.min(0.25, 0.08 + this.hitAcc / 400);
    this.hitAcc = 0;
    if (this.sample('hit', this.sfx, v * 2.4, PRIO.hit)) return;
    const h = HIT_VARIANTS[(Math.random() * HIT_VARIANTS.length) | 0];
    this.tone(this.sfx, h.f * (0.92 + Math.random() * 0.16), 0.07, h.type, v, -120, PRIO.hit);
  }
  /** Kill (os qui cassent ; élite : crâne ; boss : impact sombre) ; en rafale (≥ 5 en 1 s), un son de combo. */
  kill(boss = false, now = 0, elite = false): void {
    if (boss) {
      if (this.sample('bossHit', this.sfx, 1, PRIO.boss)) return;
      this.tone(this.sfx, 220, 0.5, 'sawtooth', 0.4, 440, PRIO.boss);
      return;
    }
    // une rafale (aura, météore : 30 kills dans le même pas) donne un seul son plus fort, pas 24 voix identiques ;
    // une élite passe toujours
    this.killAcc++;
    if (elite || now - this.lastKillSound >= 0.16 || now < this.lastKillSound) {
      this.lastKillSound = now;
      const vol = elite ? 1 : Math.min(0.9, 0.5 + this.killAcc * 0.08);
      this.killAcc = 0;
      if (!this.sample(elite ? 'killElite' : 'kill', this.sfx, vol, PRIO.kill))
        this.tone(this.sfx, 130 + Math.random() * 30, 0.12, 'square', 0.18, -80, PRIO.kill);
    }
    this.killTimes[this.killIdx] = now;
    this.killIdx = (this.killIdx + 1) % 8;
    if (now - this.lastCombo < 1.5) return;
    let recent = 0;
    for (let i = 0; i < 8; i++) if (now - this.killTimes[i] < 1) recent++;
    if (recent >= 5) {
      this.lastCombo = now;
      if (this.sample('combo', this.ui, 0.6, PRIO.kill)) return;
      this.tone(this.sfx, 440, 0.2, 'triangle', 0.22, 220, PRIO.kill);
      this.tone(this.sfx, 660, 0.25, 'triangle', 0.16, 0, PRIO.kill, 0.05);
      this.tone(this.sfx, 880, 0.25, 'sine', 0.12, 0, PRIO.kill, 0.05);
    }
  }
  /** Ramassage : +1 demi-ton par gemme enchaînée (< 400 ms), reset après 14. */
  pickup(now: number): void {
    if (now - this.lastGem < 0.1) return;
    this.gemCombo = now - this.lastGem < 0.4 ? Math.min(this.gemCombo + 1, 14) : 0;
    this.lastGem = now;
    const semi = Math.pow(1.0595, this.gemCombo);
    if (this.sample('gem', this.sfx, 0.38, PRIO.pickup, semi, 0, 0)) return; // gamme exacte : pas de hauteur aléatoire
    this.tone(this.sfx, 660 * semi, 0.07, 'triangle', 0.16, 0, PRIO.pickup);
  }
  /** Niveau : stinger au maillet. */
  levelUp(): void {
    if (this.sample('levelUp', this.ui, 1, PRIO.levelUp)) return;
    this.tone(this.ui, 523, 0.12, 'triangle', 0.3, 0, PRIO.levelUp);
    this.tone(this.ui, 784, 0.18, 'triangle', 0.3, 0, PRIO.levelUp, 0.09);
  }
  /** « Whoosh » à la reprise après le choix de carte. */
  whoosh(): void {
    if (this.sample('whoosh', this.ui, 0.7, PRIO.ui)) return;
    this.tone(this.ui, 1400, 0.22, 'sawtooth', 0.14, -1100, PRIO.ui);
  }
  jump(): void {
    if (this.sample('jump', this.sfx, 0.8, PRIO.move)) return;
    this.tone(this.sfx, 300, 0.14, 'square', 0.2, 260, PRIO.move);
  }
  /** Phase 36 : réception (pas sur l'herbe). */
  land(): void {
    this.sample('land', this.sfx, 0.9, PRIO.move);
  }
  /** Phase 27 : départ de glissade, d'autant plus grave et long que l'on va vite (frottement). */
  slide(fast: number): void {
    if (this.sample('slide', this.sfx, 0.6 + 0.3 * fast, PRIO.move, 1 - 0.15 * fast)) return;
    this.tone(this.sfx, 220 - 60 * fast, 0.22 + 0.18 * fast, 'sawtooth', 0.1 + 0.06 * fast, -90, PRIO.move);
  }
  /** Envol sur une crête ou saut glissé : souffle. */
  launch(): void {
    if (this.sample('launch', this.sfx, 0.8, PRIO.move)) return;
    this.tone(this.sfx, 320, 0.2, 'triangle', 0.2, 420, PRIO.move);
  }
  /** Glisse parfaite (1.30.1, avant : vrille réussie). */
  trick(): void {
    if (this.sample('trick', this.ui, 0.9, PRIO.levelUp)) return;
    this.tone(this.ui, 659, 0.08, 'triangle', 0.24, 0, PRIO.levelUp);
    this.tone(this.ui, 988, 0.16, 'triangle', 0.26, 0, PRIO.levelUp, 0.06);
  }
  /** Bruit mat (piste chronométrée ratée). */
  trickFail(): void {
    if (this.sample('error', this.ui, 0.8, PRIO.move)) return;
    this.tone(this.sfx, 110, 0.18, 'square', 0.2, -40, PRIO.move);
  }
  dash(): void {
    if (this.sample('launch', this.sfx, 0.7, PRIO.move, 1.2)) return;
    this.tone(this.sfx, 500, 0.12, 'sawtooth', 0.15, -300, PRIO.move);
  }
  hurt(): void {
    if (this.sample('hurt', this.sfx, 1, PRIO.hurt)) return;
    this.tone(this.sfx, 90, 0.15, 'square', 0.35, -30, PRIO.hurt);
  }
  bolt(): void {
    if (this.sample('bolt', this.sfx, 0.55, PRIO.hit)) return;
    this.tone(this.sfx, 140, 0.22, 'sawtooth', 0.2, -80, PRIO.hit);
  }
  boss(): void {
    if (this.sample('bossRoar', this.sfx, 1, PRIO.boss)) return;
    this.tone(this.sfx, 70, 0.9, 'sawtooth', 0.45, -20, PRIO.boss);
  }
  death(): void {
    if (this.sample('death', this.ui, 1, PRIO.hurt)) return;
    this.tone(this.ui, 200, 0.6, 'sawtooth', 0.4, -150, PRIO.hurt);
  }
  /** Phase 36 : victoire sur le Faucheur. */
  victory(): void {
    if (this.sample('victory', this.ui, 1, PRIO.hurt)) return;
    this.chest();
  }
  /** Coffre ramassé. */
  chest(): void {
    if (this.sample('chest', this.ui, 1, PRIO.levelUp)) return;
    this.tone(this.ui, 523, 0.1, 'triangle', 0.26, 0, PRIO.levelUp);
    this.tone(this.ui, 659, 0.1, 'triangle', 0.26, 0, PRIO.levelUp, 0.08);
    this.tone(this.ui, 784, 0.2, 'triangle', 0.3, 0, PRIO.levelUp, 0.16);
  }
  /** Phase 35 : un bonus apparaît au sol, tintement discret. */
  powerDrop(): void {
    if (this.sample('powerDrop', this.ui, 0.7, PRIO.pickup)) return;
    this.tone(this.ui, 1568, 0.09, 'sine', 0.1, 0, PRIO.pickup);
  }
  /** Phase 35 : bonus ramassé, un son par bonus (Pw : Aimant, Pluie d'or, Élan, Temps figé, Rage). */
  power(k: number): void {
    const P = PRIO.levelUp;
    const key = POWER_SFX[k];
    if (key && this.sample(key, this.ui, 1, P)) return;
    if (k === 0) {
      this.tone(this.ui, 300, 0.35, 'sine', 0.26, 900, P);
      this.tone(this.ui, 600, 0.3, 'triangle', 0.18, 900, P, 0.05);
    } else if (k === 1) {
      for (let i = 0; i < 4; i++) this.tone(this.ui, 1180 + i * 150, 0.06, 'square', 0.12, 0, P, i * 0.05);
    } else if (k === 2) {
      this.tone(this.ui, 440, 0.18, 'triangle', 0.26, 660, P);
      this.tone(this.ui, 880, 0.2, 'triangle', 0.2, 440, P, 0.08);
    } else if (k === 3) {
      this.tone(this.ui, 196, 0.9, 'sine', 0.32, 0, P);
      this.tone(this.ui, 1175, 0.6, 'sine', 0.14, -400, P, 0.02);
    } else {
      this.tone(this.sfx, 80, 0.45, 'sawtooth', 0.38, 60, P);
      this.tone(this.ui, 330, 0.25, 'square', 0.16, 160, P, 0.06);
    }
  }

  /** Coffre de carte payé (phase 18) : pièces, puis le coffre. */
  mapChest(): void {
    if (this.sample('coin', this.ui, 1, PRIO.levelUp)) {
      this.sample('chest', this.ui, 1, PRIO.levelUp, 1, 0.12);
      return;
    }
    this.tone(this.ui, 1180, 0.05, 'square', 0.12, 0, PRIO.levelUp);
    this.tone(this.ui, 1480, 0.05, 'square', 0.12, 0, PRIO.levelUp, 0.05);
    this.chest();
  }
  /** Sanctuaire chargé (phase 18) : carillon. */
  shrine(): void {
    if (this.sample('shrine', this.ui, 1, PRIO.levelUp)) return;
    this.tone(this.ui, 392, 0.7, 'sine', 0.3, 0, PRIO.levelUp);
    this.tone(this.ui, 587, 0.7, 'sine', 0.25, 0, PRIO.levelUp, 0.06);
    this.tone(this.ui, 784, 0.8, 'triangle', 0.22, 0, PRIO.levelUp, 0.12);
  }
  /** Un boss approche (phase 18) : créature lointaine. */
  bossWarn(): void {
    if (this.sample('bossRoar', this.sfx, 0.8, PRIO.boss, 0.8)) return;
    this.tone(this.sfx, 55, 0.5, 'sawtooth', 0.32, 25, PRIO.boss);
    this.tone(this.sfx, 55, 0.5, 'sawtooth', 0.32, 35, PRIO.boss, 0.55);
  }
  /** Évolution d'arme, synergie : stinger orchestral. */
  evolve(): void {
    if (this.sample('evolve', this.ui, 1, PRIO.levelUp)) return;
    this.tone(this.ui, 110, 0.6, 'sawtooth', 0.35, 110, PRIO.levelUp);
    this.tone(this.ui, 440, 0.5, 'triangle', 0.3, 0, PRIO.levelUp, 0.1);
    this.tone(this.ui, 660, 0.5, 'triangle', 0.25, 0, PRIO.levelUp, 0.1);
    this.tone(this.ui, 1320, 0.4, 'sine', 0.2, 0, PRIO.levelUp, 0.2);
  }
  /** Rugissement du Gardien avant la charge. */
  roar(): void {
    if (this.sample('bossRoar', this.sfx, 1, PRIO.boss, 1.1)) return;
    this.tone(this.sfx, 60, 0.7, 'sawtooth', 0.45, 40, PRIO.boss);
    this.tone(this.sfx, 90, 0.5, 'square', 0.2, -30, PRIO.boss, 0.05);
  }
  /** Crachat du Cracheur. */
  spit(): void {
    if (this.sample('spit', this.sfx, 0.7, PRIO.hit)) return;
    this.tone(this.sfx, 240, 0.08, 'square', 0.14, -120, PRIO.hit);
  }
  /** Flèche de l'Archer (phase 16). */
  arrow(): void {
    if (this.sample('arrow', this.sfx, 0.6, PRIO.hit)) return;
    this.tone(this.sfx, 1400, 0.09, 'triangle', 0.12, -900, PRIO.hit);
  }
  /** Boule de feu du Sorcier (phase 16). */
  cast(): void {
    if (this.sample('cast', this.sfx, 0.7, PRIO.hit)) return;
    this.tone(this.sfx, 180, 0.35, 'sawtooth', 0.16, 260, PRIO.hit);
  }
  /** Tir arrêté par un muret ou un arbre (phase 16) : petit choc mat. */
  thud(): void {
    if (this.sample('thud', this.sfx, 0.5, PRIO.hit)) return;
    this.tone(this.sfx, 150, 0.06, 'square', 0.1, -60, PRIO.hit);
  }
  /** Éruption : coup sourd (le sol crache). */
  eruption(): void {
    if (this.sample('eruption', this.sfx, 1, PRIO.kill)) return;
    this.tone(this.sfx, 55, 0.3, 'square', 0.4, 60, PRIO.kill);
    this.tone(this.sfx, 180, 0.12, 'sawtooth', 0.18, -120, PRIO.kill, 0.04);
  }
  /** Onde de choc du Gardien. */
  ring(): void {
    if (this.sample('ring', this.sfx, 0.9, PRIO.boss)) return;
    this.tone(this.sfx, 420, 0.5, 'triangle', 0.22, -300, PRIO.boss);
  }
  /** Brute élite qui arme sa charge. */
  charge(): void {
    if (this.sample('charge', this.sfx, 0.9, PRIO.boss)) return;
    this.tone(this.sfx, 110, 0.35, 'sawtooth', 0.3, 90, PRIO.boss);
  }
  /** Plongée d'un Volant. */
  dive(): void {
    if (this.sample('dive', this.sfx, 0.6, PRIO.hit)) return;
    this.tone(this.sfx, 1200, 0.3, 'sine', 0.12, -700, PRIO.hit);
  }
  /** Lancer de boomerang. */
  throwSound(): void {
    if (this.sample('throw', this.sfx, 0.7, PRIO.shoot)) return;
    this.tone(this.sfx, 700, 0.12, 'triangle', 0.14, -300, PRIO.shoot);
  }
  /** Bouclier (phase 28) : choc de métal. */
  shield(): void {
    if (this.sample('shield', this.sfx, 0.9, PRIO.hurt)) return;
    this.chest();
  }
  /**
   * Sorts de classe (phase 19) : un son par sort, au lancement (`impact` = false) ou à l'impact. `k` = index Spell.
   * Phase 36 : bruitages enregistrés quand la planche est chargée, sinon les timbres synthétisés d'origine.
   */
  spell(k: number, impact: boolean): void {
    if (this.buf) {
      this.spellSample(k, impact);
      return;
    }
    const S = this.sfx,
      P = PRIO.move;
    switch (k) {
      case 0: // Bond : souffle, puis salve claire
        if (impact) this.tone(S, 980, 0.12, 'triangle', 0.16, 400, P);
        else this.dash();
        break;
      case 1: // Tourbillon : sifflement qui tourne
        this.tone(S, 420, 0.5, 'sawtooth', 0.14, 380, P);
        this.tone(S, 640, 0.5, 'triangle', 0.1, -260, P, 0.1);
        break;
      case 2: // Clignement : craquement électrique
        if (impact) this.bolt();
        else this.tone(S, 1800, 0.14, 'square', 0.1, -1500, P);
        break;
      case 3: // Éclat : carillon lumineux
        if (impact) {
          this.tone(S, 784, 0.45, 'sine', 0.26, 0, P);
          this.tone(S, 1175, 0.4, 'triangle', 0.18, 0, P, 0.04);
        }
        break;
      case 4: // Collet : filet lancé, puis claquement des cordes
        if (impact) this.tone(S, 260, 0.12, 'square', 0.18, -120, P);
        else this.throwSound();
        break;
      case 5: // Pétard : détonation sèche et grave
        if (impact) {
          this.blast();
          this.tone(S, 160, 0.2, 'sawtooth', 0.22, -110, P, 0.02);
        }
        break;
      case 6: // Comète : souffle chaud
        if (!impact) {
          this.dash();
          this.tone(S, 220, 0.3, 'sawtooth', 0.1, 180, P, 0.03);
        }
        break;
      case 7: // Voile : nappe spectrale descendante
        if (!impact) {
          this.tone(S, 660, 0.7, 'sine', 0.2, -420, P);
          this.tone(S, 990, 0.6, 'sine', 0.12, -600, P, 0.05);
        }
        break;
      case 8: // Bourse : lancer, puis pièces qui éclatent
        if (impact) {
          this.blast();
          this.tone(S, 1320, 0.06, 'square', 0.1, 0, P, 0.03);
          this.tone(S, 1660, 0.06, 'square', 0.1, 0, P, 0.08);
        } else this.throwSound();
        break;
    }
  }
  /** Phase 36 : sons enregistrés des sorts (même découpage lancement / impact). */
  private spellSample(k: number, impact: boolean): void {
    const S = this.sfx,
      P = PRIO.move;
    switch (k) {
      case 0: // Bond
        if (impact) this.sample('orb', S, 0.8, P, 1.4);
        else this.dash();
        break;
      case 1: // Tourbillon
        this.sample('throw', S, 0.8, P, 0.8);
        this.sample('scythe', S, 0.6, P, 1.1, 0.1);
        break;
      case 2: // Clignement
        if (impact) this.bolt();
        else this.sample('spell', S, 0.8, P, 1.5);
        break;
      case 3: // Éclat
        if (impact) this.sample('trick', S, 1, P, 0.8);
        break;
      case 4: // Collet
        if (impact) this.thud();
        else this.throwSound();
        break;
      case 5: // Pétard
        if (impact) this.blast();
        break;
      case 6: // Comète
        if (!impact) {
          this.dash();
          this.sample('cast', S, 0.6, P, 1.3, 0.03);
        }
        break;
      case 7: // Voile
        if (!impact) this.sample('spell', S, 0.9, P, 0.7);
        break;
      case 8: // Bourse
        if (impact) {
          this.blast();
          this.sample('coin', S, 0.9, P, 1, 0.05);
        } else this.throwSound();
        break;
    }
  }
  /** Explosion (mine, météore, Pétard). */
  blast(): void {
    if (this.sample('blast', this.sfx, 1, PRIO.kill)) return;
    this.tone(this.sfx, 70, 0.25, 'square', 0.3, -40, PRIO.kill);
  }
  /** Sélection d'une carte : son distinct par type (nouvelle arme, arme, passif, soin). */
  select(kind: 'w' | 'wnew' | 's' | 'heal' = 'w'): void {
    const rate = kind === 's' ? 0.9 : kind === 'heal' ? 1.15 : 1;
    if (this.sample(kind === 'wnew' ? 'pickNew' : 'pick', this.ui, 0.9, PRIO.ui, rate, 0, 0)) return;
    const s = CARD_SOUNDS[kind];
    this.tone(this.ui, s.f, 0.09, s.type, 0.22, s.slide, PRIO.ui);
  }
}
