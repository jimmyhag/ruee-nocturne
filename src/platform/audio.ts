// Audio procédural Web Audio : 3 bus, pool de voix, limiteur. Aucun fichier à charger.
export class AudioBus {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private ui!: GainNode;
  private music!: GainNode;
  private voices = 0;
  private readonly MAX_VOICES = 24;
  muted = false;
  private lastGem = 0;
  private gemCombo = 0;
  private hitAcc = 0;
  private lastHitSound = 0;
  // musique : 3 couches de drones
  private layers: { osc: OscillatorNode; gain: GainNode }[] = [];
  intensity = 0;

  init(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new C();
    } catch {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 8;
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.connect(comp);
    this.sfx = c.createGain();
    this.sfx.gain.value = 0.5;
    this.ui = c.createGain();
    this.ui.gain.value = 0.4;
    this.music = c.createGain();
    this.music.gain.value = 0.22;
    this.sfx.connect(this.master);
    this.ui.connect(this.master);
    this.music.connect(this.master);
    // nappe (3 couches)
    const notes = [55, 82.41, 110]; // A1, E2, A2
    const types: OscillatorType[] = ['sine', 'triangle', 'sawtooth'];
    notes.forEach((f, i) => {
      const osc = c.createOscillator();
      osc.type = types[i];
      osc.frequency.value = f;
      const g = c.createGain();
      g.gain.value = 0;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 300 + i * 200;
      osc.connect(lp);
      lp.connect(g);
      g.connect(this.music);
      osc.start();
      this.layers.push({ osc, gain: g });
    });
  }
  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 1;
  }
  /** Mixage musique : intensité ∈ [0,1] suit la densité d'ennemis ; boss ⇒ 1. */
  setIntensity(v: number, dt: number): void {
    if (!this.ctx) return;
    this.intensity += (v - this.intensity) * Math.min(1, dt * 2);
    const i = this.intensity;
    const targets = [0.5, Math.max(0, i - 0.15) * 0.7, Math.max(0, i - 0.5) * 0.5];
    this.layers.forEach((l, k) => (l.gain.gain.value = targets[k]));
  }
  stopMusic(): void {
    for (const l of this.layers) l.gain.gain.value = 0;
  }

  private tone(bus: GainNode, freq: number, dur: number, type: OscillatorType, vol: number, slide = 0): void {
    if (!this.ctx || this.muted || this.voices >= this.MAX_VOICES) return;
    const c = this.ctx,
      t = c.currentTime;
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
    this.voices++;
    o.onended = () => this.voices--;
  }

  shoot(): void {
    this.tone(this.sfx, 880 + Math.random() * 80, 0.05, 'triangle', 0.12, -400);
  }
  /** Les coups sont agrégés : au-delà de 12/s, un seul son plus fort. */
  hit(dmg: number, now: number): void {
    this.hitAcc += dmg;
    if (now - this.lastHitSound < 0.08) return;
    this.lastHitSound = now;
    const v = Math.min(0.25, 0.08 + this.hitAcc / 400);
    this.hitAcc = 0;
    this.tone(this.sfx, 180 + Math.random() * 40, 0.07, 'square', v, -120);
  }
  kill(boss = false): void {
    if (boss) this.tone(this.sfx, 220, 0.5, 'sawtooth', 0.4, 440);
    else this.tone(this.sfx, 130 + Math.random() * 30, 0.12, 'square', 0.18, -80);
  }
  pickup(now: number): void {
    if (now - this.lastGem < 0.05) return;
    this.gemCombo = now - this.lastGem < 0.4 ? Math.min(this.gemCombo + 1, 14) : 0;
    this.lastGem = now;
    this.tone(this.sfx, 660 * Math.pow(1.0595, this.gemCombo), 0.07, 'triangle', 0.16);
  }
  levelUp(): void {
    this.tone(this.ui, 523, 0.12, 'triangle', 0.3);
    setTimeout(() => this.tone(this.ui, 784, 0.18, 'triangle', 0.3), 90);
  }
  jump(): void {
    this.tone(this.sfx, 300, 0.14, 'square', 0.2, 260);
  }
  dash(): void {
    this.tone(this.sfx, 500, 0.12, 'sawtooth', 0.15, -300);
  }
  hurt(): void {
    this.tone(this.sfx, 90, 0.15, 'square', 0.35, -30);
  }
  bolt(): void {
    this.tone(this.sfx, 140, 0.22, 'sawtooth', 0.2, -80);
  }
  boss(): void {
    this.tone(this.sfx, 70, 0.9, 'sawtooth', 0.45, -20);
  }
  death(): void {
    this.tone(this.ui, 200, 0.6, 'sawtooth', 0.4, -150);
  }
  select(): void {
    this.tone(this.ui, 440, 0.06, 'square', 0.2, 200);
  }
}
