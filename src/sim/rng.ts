// PRNG mulberry32 : rapide, déterministe, 32 bits d'état. Suffisant pour un jeu.
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** [0, 1) */
  next(): number {
    // phase 49 : l'état reste un entier 32 bits signé (avant : il grossissait sans fin et aurait perdu en précision
    // passé 2^53, dans une partie de plusieurs millions de tirages). La suite tirée ne change pas : seul s >>> 0 compte
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = this.s >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }
  int(n: number): number {
    return (this.next() * n) | 0;
  }
  state(): number {
    return this.s;
  }
  /** Phase 49 : reprend la suite là où `state()` l'a laissée (partie gardée en mémoire). */
  setState(s: number): void {
    this.s = s | 0;
  }
}

/** Hash d'une chaîne (défi quotidien : hash de la date). */
export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
