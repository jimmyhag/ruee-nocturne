// 1.69.3 (docs/specs/sauvegarde-sure.md) : une sauvegarde qui ne recule jamais. La méta est écrite dans localStorage
// (synchrone) et dans IndexedDB (asynchrone) ; chaque copie porte un numéro de révision et le chargement garde la plus
// récente. IndexedDB est remplacé par un faux magasin en mémoire dont on peut suspendre l'écriture (page fermée avant la
// fin) ; un rechargement de la page est un module neuf (vi.resetModules), les deux stockages restant ce qu'ils étaient.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const idb = vi.hoisted(() => ({
  data: new Map<string, unknown>(),
  hold: false, // écriture commencée mais jamais aboutie (page rechargée ou fermée avant)
  broken: false, // IndexedDB indisponible : idb-keyval lève tout de suite
}));
vi.mock('idb-keyval', () => ({
  get: (k: string): Promise<unknown> => {
    if (idb.broken) throw new ReferenceError('indexedDB is not defined');
    return Promise.resolve(structuredClone(idb.data.get(k)));
  },
  set: (k: string, v: unknown): Promise<void> => {
    if (idb.broken) throw new ReferenceError('indexedDB is not defined');
    if (idb.hold) return new Promise<void>(() => {});
    // comme le vrai : la copie est prise plus tard, une fois la base ouverte
    return Promise.resolve().then(() => void idb.data.set(k, structuredClone(v)));
  },
}));

class MemStore {
  data = new Map<string, string>();
  full = false; // quota dépassé : l'écriture lève, la lecture marche
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    if (this.full) throw new DOMException('quota', 'QuotaExceededError');
    this.data.set(k, v);
  }
  removeItem(k: string): void {
    this.data.delete(k);
  }
}
const KEY = 'ruee-meta';
let ls: MemStore;
let lsBlocked = false;

beforeEach(() => {
  idb.data.clear();
  idb.hold = false;
  idb.broken = false;
  ls = new MemStore();
  lsBlocked = false;
  // navigation privée stricte : lire `localStorage` lève
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    get: () => {
      if (lsBlocked) throw new DOMException('blocked', 'SecurityError');
      return ls;
    },
  });
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

type SaveModule = typeof import('./save');
/** Ouverture (ou rechargement) de la page : un module neuf, comme main.ts au démarrage (peekMeta puis loadMeta). */
async function boot(): Promise<{ s: SaveModule; m: import('./save').Meta }> {
  vi.resetModules();
  const s = await import('./save');
  s.peekMeta();
  const m = await s.loadMeta();
  await flush();
  return { s, m };
}
/** Laisse aboutir les écritures IndexedDB en cours. */
const flush = () => new Promise<void>((r) => setTimeout(r, 0));
const lsCopy = (): Record<string, unknown> => JSON.parse(ls.getItem(KEY) ?? 'null');
const idbCopy = (): Record<string, unknown> => idb.data.get(KEY) as Record<string, unknown>;

describe('Une sauvegarde qui ne recule jamais (1.69.3)', () => {
  it('An interrupted save does not erase the latest progression', async () => {
    const { s, m } = await boot();
    m.gold = 100;
    m.runs = 3;
    s.saveMeta(m);
    await flush();
    expect(idbCopy().gold).toBe(100);
    // fin de partie : or et parties enregistrés, la page se ferme avant la fin de l'écriture IndexedDB
    idb.hold = true;
    m.gold = 250;
    m.runs = 4;
    m.stats.bestTime = 312;
    s.saveMeta(m);
    expect(idbCopy().gold).toBe(100);
    idb.hold = false;
    const after = (await boot()).m;
    expect(after.gold).toBe(250);
    expect(after.runs).toBe(4);
    expect(after.stats.bestTime).toBe(312);
    // décision 4 : la copie en retard est réparée
    expect(idbCopy().gold).toBe(250);
    expect(idbCopy().rev).toBe(lsCopy().rev);
  });

  it('A setting changed just before a reload is kept', async () => {
    let { s, m } = await boot();
    m.settings.lang = 'fr';
    s.saveMeta(m);
    await flush();
    for (let i = 0; i < 10; i++) {
      ({ s, m } = await boot());
      expect(m.settings.lang).toBe('fr');
      idb.hold = true; // rechargement aussitôt : l'écriture IndexedDB n'aboutit pas
      m.settings.lang = 'en';
      s.saveMeta(m);
      idb.hold = false;
      ({ s, m } = await boot());
      expect(m.settings.lang, `essai ${i + 1}`).toBe('en');
      m.settings.lang = 'fr'; // retour au français pour l'essai suivant, écriture aboutie
      s.saveMeta(m);
      await flush();
    }
  });

  it('An old save loads as before', async () => {
    // sauvegardes d'avant la 1.69.3 : pas de numéro ; IndexedDB gagne, comme aujourd'hui
    const old = {
      version: 5,
      gold: 500,
      goldEarned: 900,
      runs: 12,
      bestTime: 431,
      achievements: ['survie3'],
      settings: { lang: 'en' },
    };
    idb.data.set(KEY, structuredClone(old));
    ls.setItem(KEY, JSON.stringify({ ...old, gold: 300, runs: 11 }));
    const { s, m } = await boot();
    const { normalizeMeta } = s;
    expect(m).toEqual(normalizeMeta(old));
    expect('rev' in m).toBe(false);
    // la prochaine sauvegarde porte un numéro, dans les deux copies
    s.saveMeta(m);
    await flush();
    expect(lsCopy().rev).toEqual(expect.any(Number));
    expect(lsCopy().rev).toBeGreaterThan(0);
    expect(idbCopy().rev).toBe(lsCopy().rev);
    const after = (await boot()).m;
    expect(after.gold).toBe(500);
    expect(after.runs).toBe(12);
  });

  it('An old save in localStorage alone loads as before', async () => {
    ls.setItem(KEY, JSON.stringify({ version: 5, gold: 70, runs: 2 }));
    const { s, m } = await boot();
    expect(m).toEqual(s.normalizeMeta({ version: 5, gold: 70, runs: 2 }));
  });

  it('On a tie, IndexedDB is kept', async () => {
    idb.data.set(KEY, { version: 5, gold: 40, rev: 3 });
    ls.setItem(KEY, JSON.stringify({ version: 5, gold: 30, rev: 3 }));
    const { m } = await boot();
    expect(m.gold).toBe(40);
  });

  it('A more recent IndexedDB copy wins over localStorage', async () => {
    // localStorage plein (quota) : sa copie est restée en arrière, IndexedDB a la dernière
    idb.data.set(KEY, { version: 5, gold: 80, rev: 9 });
    ls.setItem(KEY, JSON.stringify({ version: 5, gold: 20, rev: 4 }));
    const { s, m } = await boot();
    expect(m.gold).toBe(80);
    s.saveMeta(m);
    expect(lsCopy().rev).toBe(10); // le numéro suit la copie la plus récente
  });

  it('The revision number does not leave the device', async () => {
    let { s, m } = await boot();
    m.runs = 5;
    m.pseudo = 'Lune';
    s.saveMeta(m);
    await flush();
    ({ s, m } = await boot());
    expect(lsCopy().rev).toBeGreaterThan(0);
    const { PROGRESS_KEYS, toCloudDoc, withProgress } = await import('./sync');
    expect(PROGRESS_KEYS as string[]).not.toContain('rev');
    const doc = toCloudDoc(m, 1_700_000_000_000);
    expect(JSON.stringify(doc)).not.toMatch(/"rev"/);
    expect(doc.progress).toMatchObject({ runs: 5, pseudo: 'Lune' });
    // une progression reçue qui porterait un numéro ne l'apporte pas dans la méta
    expect('rev' in withProgress(m, { ...(doc.progress as object), rev: 99 })).toBe(false);
    // l'export garde son format
    expect(JSON.parse(s.exportMeta(m)).meta.rev).toBeUndefined();
  });

  it('An import replaces the revision number with a fresh one', async () => {
    const { s, m } = await boot();
    s.saveMeta(m);
    s.saveMeta(m);
    const before = lsCopy().rev as number;
    const imported = s.importMeta(JSON.stringify({ app: 'ruee-nocturne', meta: { ...m, gold: 77, rev: 999 } }));
    expect(imported && 'rev' in imported).toBe(false);
    s.saveMeta(imported!);
    await flush();
    expect(lsCopy().rev).toBe(before + 1);
    const after = (await boot()).m;
    expect(after.gold).toBe(77);
  });

  it('A blocked localStorage leaves IndexedDB enough', async () => {
    lsBlocked = true;
    let { s, m } = await boot();
    m.gold = 60;
    expect(() => s.saveMeta(m)).not.toThrow();
    await flush();
    m.gold = 90;
    s.saveMeta(m);
    await flush();
    ({ s, m } = await boot());
    expect(m.gold).toBe(90);
  });

  it('An unavailable IndexedDB leaves localStorage enough', async () => {
    idb.broken = true;
    let { s, m } = await boot();
    m.gold = 60;
    expect(() => s.saveMeta(m)).not.toThrow();
    m.gold = 90;
    s.saveMeta(m);
    ({ s, m } = await boot());
    expect(m.gold).toBe(90);
  });

  it('Two tabs never let an older copy win', async () => {
    // (A) les deux stockages marchent : l'onglet B sauvegarde deux fois, puis l'onglet A, ouvert avant, sauvegarde et la
    // page se ferme avant la fin de son écriture IndexedDB : sa sauvegarde, la dernière, doit gagner
    let a = await boot();
    a.s.saveMeta(a.m);
    await flush();
    a = await boot();
    const b = await boot(); // second onglet, ouvert sur la même sauvegarde
    b.m.gold = 11;
    b.s.saveMeta(b.m);
    b.m.gold = 12;
    b.s.saveMeta(b.m);
    await flush();
    idb.hold = true;
    a.m.gold = 13;
    a.s.saveMeta(a.m);
    idb.hold = false;
    expect((await boot()).m.gold).toBe(13);
  });

  it('Two tabs with a full localStorage keep the latest IndexedDB copy', async () => {
    // (B) localStorage plein : sa copie reste la dernière de l'onglet A ; l'onglet B, qui a moins compté, écrit ensuite
    // dans IndexedDB seul : sa sauvegarde, la dernière, gagne, et la réparation ne l'écrase pas
    let a = await boot();
    a.s.saveMeta(a.m);
    await flush();
    a = await boot();
    const b = await boot();
    for (const gold of [21, 22, 23, 24]) {
      a.m.gold = gold;
      a.s.saveMeta(a.m);
    }
    await flush();
    ls.full = true;
    b.m.gold = 30;
    b.s.saveMeta(b.m);
    await flush();
    expect(lsCopy().gold).toBe(24);
    expect((await boot()).m.gold).toBe(30);
    expect(idbCopy().gold).toBe(30);
  });
});
