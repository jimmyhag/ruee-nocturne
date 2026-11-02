// Cibles d'équilibrage (survivor-design §9) pour le bot « average ».
export interface Target { name: string; min: number; max: number; get: (s: any) => number; fmt?: (v: number) => string; }
const mmss = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
export const TARGETS: Target[] = [
  { name: 'survie p50 9–13 min', min: 540, max: 780, get: (s) => s.survival.p50, fmt: mmss },
  { name: 'fin atteinte 8–15 %', min: 8, max: 15, get: (s) => s.reachedEndPct, fmt: (v) => v.toFixed(0) + ' %' },
  { name: 'morts <3 min < 10 %', min: 0, max: 10, get: (s) => s.deadBefore3minPct, fmt: (v) => v.toFixed(0) + ' %' },
  { name: 'kills@10 900–1500', min: 900, max: 1500, get: (s) => s.killsAt10p50 },
  { name: 'niveau@10 16–20', min: 16, max: 20, get: (s) => s.levelAt10p50 },
  { name: 'pick min ≥ 8 %', min: 8, max: 100, get: (s) => Math.min(...Object.values<number>(s.pickPct)), fmt: (v) => v + ' %' },
  { name: 'pick max ≤ 35 %… hors arme de départ', min: 0, max: 100, get: (s) => Math.max(...Object.entries<number>(s.pickPct).filter(([k]) => k !== 'orbe').map(([, v]) => v)), fmt: (v) => v + ' %' },
];
export function checkTargets(summary: any, targets: Target[]) {
  return targets.map((t) => { const v = t.get(summary); return { name: t.name, value: t.fmt ? t.fmt(v) : String(v), ok: v >= t.min && v <= t.max }; });
}
