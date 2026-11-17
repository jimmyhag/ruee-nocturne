// Lot L1 : mesure anonyme de la rétention (docs/specs/l1-mesure-retention.md). État local, document Firestore, tableau
// D1/D7/D30 et règles qui protègent la collection `retention`.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  RETENTION,
  acceptState,
  dayOf,
  deleted,
  docOf,
  docUrl,
  formatTable,
  fromFirestore,
  markOpen,
  readState,
  refusedState,
  retentionTable,
  shouldSend,
  toFirestore,
  type RetentionDoc,
} from './retention';

const ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const DAY = 86_400_000;
const TODAY = dayOf(Date.UTC(2026, 10, 17, 12)); // mardi 17 nov. 2026, semaine 2026-W47

describe('état local (ruee-retention)', () => {
  it('sans état ou illisible : pas encore de réponse, rien à envoyer', () => {
    for (const raw of [null, '', '{', '42', '{"consent":"peut-être"}']) {
      const s = readState(raw);
      expect(s.consent).toBeNull();
      expect(s.id).toBeNull();
      expect(shouldSend(s, TODAY)).toBe(false);
    }
  });
  it('un refus ne garde ni identifiant ni jour : rien ne part', () => {
    const s = readState(JSON.stringify({ consent: 'no', id: ID, c: TODAY, f: true, o: [0], sent: 0 }));
    expect(s).toEqual({ consent: 'no', id: null, c: 0, f: false, o: [], sent: 0, del: [] });
    expect(markOpen(s, TODAY)).toBe(false);
    expect(shouldSend(s, TODAY)).toBe(false);
  });
  it('accord : cohorte du jour, ouverture du jour notée, nouveau joueur si au plus une partie finie', () => {
    const s = acceptState(ID, TODAY, 1);
    expect(s).toEqual({ consent: 'yes', id: ID, c: TODAY, f: true, o: [0], sent: 0, del: [] });
    expect(acceptState(ID, TODAY, 2).f).toBe(false);
    expect(shouldSend(s, TODAY)).toBe(true);
  });
  it('relu tel quel, et borné (jours hors 0..30, doublons, identifiant de mauvaise taille)', () => {
    const s = acceptState(ID, TODAY, 0);
    expect(readState(JSON.stringify(s))).toEqual(s);
    const odd = readState(
      JSON.stringify({ consent: 'yes', id: ID, c: TODAY, f: 1, o: [0, 0, -1, 31, 2.5, 3], sent: 9 }),
    );
    expect(odd.o).toEqual([0, 3]);
    expect(odd.f).toBe(false);
    expect(odd.sent).toBe(2);
    expect(readState(JSON.stringify({ consent: 'yes', id: 'court', c: TODAY, o: [0] })).consent).toBeNull();
  });
});

describe('ouvertures et envois', () => {
  it('a player who accepts sends a single document per day', () => {
    const s = acceptState(ID, TODAY, 1);
    s.sent = s.o.length; // premier envoi réussi
    expect(markOpen(s, TODAY)).toBe(false); // deuxième ouverture du jour : rien de neuf
    expect(shouldSend(s, TODAY)).toBe(false);
  });
  it('the next day adds an opening day', () => {
    const s = acceptState(ID, TODAY - 1, 1);
    s.sent = 1;
    expect(markOpen(s, TODAY)).toBe(true);
    expect(s.o).toEqual([0, 1]);
    expect(shouldSend(s, TODAY)).toBe(true);
  });
  it('after thirty days nothing is sent', () => {
    const s = acceptState(ID, TODAY - 31, 1);
    expect(markOpen(s, TODAY)).toBe(false);
    expect(s.o).toEqual([0]);
    expect(shouldSend(s, TODAY)).toBe(false); // même un jour pas encore parti ne part plus
    const last = acceptState(ID, TODAY - RETENTION.lastDay, 1);
    last.sent = 1;
    expect(markOpen(last, TODAY)).toBe(true);
    expect(shouldSend(last, TODAY)).toBe(true); // J30 compte encore
  });
  it('a failed send goes again at the next opening', () => {
    const s = acceptState(ID, TODAY - 1, 1); // l'envoi d'hier a échoué : sent reste à 0
    markOpen(s, TODAY);
    expect(shouldSend(s, TODAY)).toBe(true);
    expect(docOf(s).o).toEqual([0, 1]);
  });
});

describe('document Firestore', () => {
  it('ne contient que c, f, o et x ; x = cohorte + 90 jours', () => {
    const s = acceptState(ID, TODAY, 1);
    markOpen(s, TODAY + 1);
    const d = docOf(s);
    expect(d).toEqual({ c: TODAY, f: true, o: [0, 1], x: (TODAY + RETENTION.keepDays) * DAY });
    const body = toFirestore(d);
    expect(Object.keys(body)).toEqual(['fields']);
    expect(body.fields).toEqual({
      c: { integerValue: String(TODAY) },
      f: { booleanValue: true },
      o: { arrayValue: { values: [{ integerValue: '0' }, { integerValue: '1' }] } },
      x: { timestampValue: '2027-02-15T00:00:00.000Z' },
    });
    expect(JSON.stringify(body)).not.toContain(ID); // l'identifiant n'est que dans l'URL
    expect(fromFirestore(body.fields)).toEqual(d);
  });
  it('relit une liste vide et refuse un document incomplet', () => {
    expect(fromFirestore({ c: { integerValue: '3' }, f: { booleanValue: false }, o: { arrayValue: {} }, x: {} })).toBe(
      null,
    );
    expect(
      fromFirestore({
        c: { integerValue: '3' },
        f: { booleanValue: false },
        o: { arrayValue: {} },
        x: { timestampValue: '1970-04-03T00:00:00Z' },
      }),
    ).toEqual({ c: 3, f: false, o: [], x: 92 * DAY });
    expect(fromFirestore({ c: { integerValue: '3' } })).toBeNull();
  });
  it('URL REST du document : projet, collection retention, identifiant, clé d’API', () => {
    expect(docUrl('ruee-nocturne', 'AIza b', ID)).toBe(
      `https://firestore.googleapis.com/v1/projects/ruee-nocturne/databases/(default)/documents/retention/${ID}?key=AIza%20b`,
    );
  });
});

/** Un document de cohorte `c` qui a ouvert les jours `o`. */
const doc = (c: number, o: number[], f = true): RetentionDoc => ({ c, f, o, x: (c + 90) * DAY });

describe('tableau de rétention', () => {
  it('the D1 D7 D30 computation ignores cohorts that are too young', () => {
    const now = TODAY * DAY + 3_600_000;
    const old = TODAY - 40; // semaine 2026-W41 : assez vieille pour D1, D7 et D30
    const mid = TODAY - 8; // lundi 9 nov., semaine 2026-W46 : D1 et D7, pas D30
    const young = TODAY; // semaine 2026-W47 : rien
    const rows = retentionTable(
      [
        doc(old, [0, 1, 7, 30]),
        doc(old, [0, 1]),
        doc(old, [0, 7], false),
        doc(old, [0]),
        doc(mid, [0, 1, 7]),
        doc(mid, [0, 2], false),
        doc(young, [0]),
      ],
      now,
    );
    expect(rows.map((r) => r.week)).toEqual(['2026-W41', '2026-W46', '2026-W47']);
    const [a, b, c] = rows;
    expect(a.all).toEqual({ n: 4, d: [50, 50, 25] });
    expect(a.fresh).toEqual({ n: 3, d: [67, 33, 33] });
    expect(b.all).toEqual({ n: 2, d: [50, 50, null] });
    expect(b.fresh).toEqual({ n: 1, d: [100, 100, null] });
    expect(c.all).toEqual({ n: 1, d: [null, null, null] });
    const text = formatTable(rows);
    expect(text).toContain('2026-W47');
    expect(text.split('\n').find((l) => l.startsWith('2026-W47'))).toMatch(/—.*—.*—/);
  });
  it('Dn d’une semaine ne compte que ses joueurs assez vieux', () => {
    // même semaine : l'un a 7 jours, l'autre 6 ; D7 ne regarde que le premier
    const monday = TODAY - 8;
    const rows = retentionTable([doc(monday + 1, [0, 7]), doc(monday + 2, [0])], (monday + 8) * DAY);
    expect(rows[0].all.d[1]).toBe(100);
  });
  it('ignore les documents expirés', () => {
    const now = TODAY * DAY;
    const gone = { ...doc(TODAY - 95, [0, 1]), x: now - 1 };
    expect(retentionTable([gone, doc(TODAY - 2, [0])], now)).toHaveLength(1);
  });
});

describe('firestore.rules (retention)', () => {
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  const start = rules.indexOf('match /retention/{id}');
  const block = rules.slice(start, rules.indexOf('\n    }', start));
  it('aucune lecture, suppression permise, avant la règle qui refuse tout le reste', () => {
    expect(start).toBeGreaterThan(0);
    expect(start).toBeLessThan(rules.indexOf('match /{document=**}'));
    expect(block).toContain('allow get, list: if false;');
    expect(block).toContain('allow delete: if true;');
  });
  it('clés fermées et bornes identiques au client', () => {
    expect(block).toContain('id.size() == 36');
    expect(block).toContain("d.keys().hasOnly(['c', 'f', 'o', 'x'])");
    expect(block).toContain("d.keys().hasAll(['c', 'f', 'o', 'x'])");
    expect(block).toContain(`d.o.size() <= ${RETENTION.lastDay + 1}`);
    expect(block).toContain('duration.value(100, "d")');
    expect(block).toContain('request.resource.data.c == resource.data.c');
    expect(RETENTION.keepDays).toBeLessThan(100);
  });
  it("un accord donné hors ligne reste accepté jusqu'à J30 (cohorte jusqu'à 31 jours avant la création)", () => {
    expect(block).toContain(`request.time - duration.value(${RETENTION.lastDay + 1}, "d")`);
    expect(block).toContain('request.time + duration.value(2, "d")');
  });
});

describe('retrait hors ligne (suppression en attente)', () => {
  const ID2 = '1f8fad5b-d9cb-469f-a165-70867728950e';
  it("le retrait garde l'identifiant à supprimer, relu après redémarrage, et un nouvel accord ne l'efface pas", () => {
    const s = refusedState([ID]);
    expect(s.consent).toBe('no');
    expect(s.id).toBeNull();
    const back = readState(JSON.stringify(s));
    expect(back.del).toEqual([ID]);
    expect(acceptState(ID2, TODAY, 3, back.del).del).toEqual([ID]);
  });
  it("une suppression confirmée retire l'identifiant ; la liste est bornée", () => {
    const s = refusedState([ID, ID2]);
    deleted(s, ID);
    expect(s.del).toEqual([ID2]);
    const many = Array.from({ length: 9 }, (_, i) => ID.slice(0, -1) + i);
    expect(refusedState(many).del).toHaveLength(RETENTION.maxDel);
    expect(readState(JSON.stringify({ consent: null, del: ['court', ID] })).del).toEqual([ID]);
  });
});

describe('la mesure ne charge jamais le SDK Firebase (sources)', () => {
  it("ni src/platform/retention.ts ni src/platform/firebase-config.ts n'importent firebase ou le module du compte", () => {
    for (const f of ['../platform/retention.ts', '../platform/firebase-config.ts']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      expect(src).not.toMatch(/from ['"]firebase/);
      expect(src).not.toMatch(/import\(['"]firebase/);
      expect(src).not.toMatch(/['"]\.\/account['"]/);
    }
  });
});
