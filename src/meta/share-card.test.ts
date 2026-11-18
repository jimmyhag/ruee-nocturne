// Lot L4 (docs/specs/l4-partage-defi-amis.md) : carte de résultat, lien de défi, amis, classement du jour entre amis.
// Un test par scénario de la spec dont la logique est pure (titre en anglais) ; le reste est dans e2e/defi-amis.spec.ts.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { CHARACTERS, ITEM_KEYS } from '../sim/balance';
import { WEAPON_KEYS } from '../sim/weapons/defs';
import { setLang, t } from '../i18n';
import { BOARD, dayExpiry, dayWritable, friendRows, mergeDay, readDay } from './board';
import type { DayDoc } from './board';
import { dailyMapSeed, dailySeed } from './daily';
import { FRIENDS, addFriend, normalizeFriends, removeFriend } from './friends';
import type { Friend } from './friends';
import { DEFAULT_META, normalizeMeta } from './save';
import {
  CHALLENGE,
  cardText,
  challengeGap,
  challengeUrl,
  isChallengeHash,
  parseChallenge,
  validDay,
} from './share-card';
import { PROGRESS_KEYS, withProgress } from './sync';
import { shareText } from '../platform/share';

const TODAY = '2026-11-17';
const UID_A = 'aB3dE5gH7jK9mN1pQ3sT5vW7yZ9b';
const UID_B = 'Zz1Yy2Xx3Ww4Vv5Uu6Tt7Ss8Rr9q';
const UID_ME = 'Me000000000000000000000000me';

afterEach(() => setLang('fr'));

describe('The result card reveals nothing about the run', () => {
  const url = challengeUrl('https://ruee-nocturne.web.app', { date: TODAY, t: 300, k: 412 });
  it('contient la date, le temps, les kills, la série et un lien de défi', () => {
    const text = cardText({ date: TODAY, t: 300, k: 412, ok: true, medal: 0, streak: 4 }, url);
    expect(text).toBe(
      [
        'Swarmageddon · Défi du 17 nov.',
        '⏱ 5:00 ✅  💀 412',
        '🔥 Série : 4 jours',
        'Bats-moi : https://ruee-nocturne.web.app/#defi=2026-11-17&t=300&k=412',
      ].join('\n'),
    );
  });
  it('ne contient aucune arme, aucun objet, aucun personnage', () => {
    const text = cardText({ date: TODAY, t: 300, k: 412, ok: true, medal: 0, streak: 4 }, url).toLowerCase();
    const names = [
      ...WEAPON_KEYS.flatMap((k) => [k, t(`weapon.${k}.name`)]),
      ...ITEM_KEYS.flatMap((k) => [k, t(`item.${k}.name`)]),
      ...CHARACTERS.flatMap((c) => [c.key, t(`char.${c.key}.name`)]),
    ];
    for (const n of names) if (n.length > 2) expect(text, n).not.toContain(n.toLowerCase());
  });
  it('partie ratée : ❌ ; pas de série en dessous de 2 ; dans la langue du joueur', () => {
    setLang('en');
    const text = cardText({ date: TODAY, t: 221, k: 120, ok: false, medal: 0, streak: 1 }, url);
    expect(text.split('\n')).toEqual(['Swarmageddon · Challenge of Nov 17', '⏱ 3:41 ❌  💀 120', `Beat me: ${url}`]);
  });
  it('le lien ne porte que la date, le temps, les kills, et le pseudo et l’identifiant s’ils sont donnés', () => {
    expect(challengeUrl('http://localhost:4173', { date: TODAY, t: 221.7, k: 120 }, 'Jim my!', UID_A)).toBe(
      `http://localhost:4173/#defi=${TODAY}&t=221&k=120&n=Jim+my&u=${UID_A}`,
    );
    // pas de pseudo : ni nom ni identifiant
    expect(challengeUrl('http://x', { date: TODAY, t: 5, k: 1 }, '', UID_A)).toBe(`http://x/#defi=${TODAY}&t=5&k=1`);
  });
});

describe('Without native share the result is copied', () => {
  it('sans navigator.share : le texte part dans le presse-papiers', async () => {
    const copied: string[] = [];
    const r = await shareText('carte', { clipboard: { writeText: async (s) => void copied.push(s) } });
    expect(r).toBe('copied');
    expect(copied).toEqual(['carte']);
  });
  it('partage natif quand il existe ; annulé par le joueur : rien', async () => {
    const shared: string[] = [];
    expect(await shareText('a', { share: async (d) => void shared.push(d.text) })).toBe('shared');
    expect(shared).toEqual(['a']);
    const abort = Object.assign(new Error('x'), { name: 'AbortError' });
    expect(
      await shareText('b', {
        share: () => Promise.reject(abort),
        clipboard: { writeText: () => Promise.reject(new Error('jamais appelé')) },
      }),
    ).toBe('cancelled');
  });
  it('partage refusé : presse-papiers ; ni l’un ni l’autre : texte à copier à la main', async () => {
    const copied: string[] = [];
    const deny = Object.assign(new Error('x'), { name: 'NotAllowedError' });
    expect(
      await shareText('c', {
        share: () => Promise.reject(deny),
        clipboard: { writeText: async (s) => void copied.push(s) },
      }),
    ).toBe('copied');
    expect(copied).toEqual(['c']);
    expect(await shareText('d', {})).toBe('manual');
    expect(await shareText('e', { clipboard: { writeText: () => Promise.reject(new Error('refus')) } })).toBe('manual');
  });
});

describe('A challenge sent to a friend opens the same run', () => {
  it('le lien rend le jour, le score à battre et l’expéditeur', () => {
    const url = challengeUrl('https://ruee-nocturne.web.app', { date: TODAY, t: 300, k: 412 }, 'Jimmy', UID_A);
    expect(parseChallenge(new URL(url).hash, TODAY)).toEqual({
      date: TODAY,
      t: 300,
      k: 412,
      name: 'Jimmy',
      uid: UID_A,
    });
    // règle 8 : tout est dans le fragment, que le navigateur n'envoie jamais à l'hébergeur
    expect(new URL(url).search).toBe('');
    expect(isChallengeHash(new URL(url).hash)).toBe(true);
    expect(isChallengeHash('#debug=1')).toBe(false);
  });
  it('la graine du défi ne dépend que du jour : même carte et même hasard pour l’ami', () => {
    expect(dailyMapSeed(TODAY)).toBe(dailyMapSeed(TODAY));
    expect(dailySeed(TODAY)).toBe(dailySeed(TODAY));
    expect(dailyMapSeed('2026-11-16')).not.toBe(dailyMapSeed(TODAY));
  });
  it('score à battre : le temps d’abord, les kills à temps égal ; l’égalité bat le défi', () => {
    expect(challengeGap({ t: 300.4, k: 413 }, { t: 300, k: 412 })).toBeNull();
    expect(challengeGap({ t: 300, k: 412 }, { t: 300, k: 412 })).toBeNull();
    expect(challengeGap({ t: 300, k: 400 }, { t: 300, k: 412 })).toEqual({ t: 0, k: 12 });
    expect(challengeGap({ t: 221.9, k: 900 }, { t: 300, k: 412 })).toEqual({ t: 79, k: 0 });
  });
});

describe('A past day’s challenge does not count for the streak', () => {
  it('un lien d’hier est un défi valide (même graine que ce jour-là), un lien de demain ne l’est pas', () => {
    expect(parseChallenge('#defi=2026-11-16&t=120&k=50', TODAY)?.date).toBe('2026-11-16');
    expect(parseChallenge('#defi=2026-11-18&t=120&k=50', TODAY)).toBeNull();
  });
});

describe('An invalid link opens the normal menu', () => {
  it.each([
    '',
    '#debug=1',
    '#defi=hier&t=10&k=1',
    '#defi=2026-13-01&t=10&k=1',
    '#defi=2026-02-30&t=10&k=1',
    '#defi=2025-12-31&t=10&k=1',
    '#defi=2026-11-17&t=3601&k=1', // défi v2 : 5:00 puis la suite en monde infini, une heure au plus
    '#defi=2026-11-17&t=-5&k=1',
    '#defi=2026-11-17&t=1e3&k=1',
    '#defi=2026-11-17&t=12.5&k=1',
    '#defi=2026-11-17&t=10',
    '#defi=2026-11-17&t=10&k=20001',
    '#defi=2026-11-17&t=10&k=abc',
    '#defi=2026-11-17&t=10&k=9999999999',
    '#defi=<img src=x onerror=alert(1)>&t=10&k=1',
  ])('%s → menu normal', (search) => {
    expect(parseChallenge(search, TODAY)).toBeNull();
  });
  it('un pseudo ou un identifiant illisible ne casse rien : « un ami », sans ami ajouté', () => {
    const c = parseChallenge(`#defi=${TODAY}&t=10&k=1&n=%3Cscript%3Ealert(1)%3C%2Fscript%3E&u=..%2F..%2Fsaves`, TODAY);
    expect(c).toEqual({ date: TODAY, t: 10, k: 1, name: 'scriptalert1scri', uid: '' }); // chevrons retirés, 16 caractères
    expect(parseChallenge(`#defi=${TODAY}&t=10&k=1&n=%3C%3E&u=${UID_A}`, TODAY)).toEqual({
      date: TODAY,
      t: 10,
      k: 1,
      name: '',
      uid: '', // un identifiant sans pseudo n'ajoute personne
    });
    expect(validDay('2028-02-29')).toBe(true);
    expect(CHALLENGE.timeMax).toBe(3600); // défi v2 (décision 8) : 300 → 3 600 s
  });
});

describe('A link from a signed-in friend adds them to friends', () => {
  it('une seule fois, jamais soi-même, 50 au plus', () => {
    const list: Friend[] = [];
    expect(addFriend(list, { uid: UID_A, name: 'Jimmy' }, UID_ME)).toBe(true);
    expect(addFriend(list, { uid: UID_A, name: 'Jimmy' }, UID_ME)).toBe(false);
    expect(addFriend(list, { uid: UID_A, name: 'Jim' }, UID_ME)).toBe(true); // renommé, toujours une ligne
    expect(list).toEqual([{ uid: UID_A, name: 'Jim' }]);
    expect(addFriend(list, { uid: UID_ME, name: 'Moi' }, UID_ME)).toBe(false);
    for (let i = 0; i < 60; i++) addFriend(list, { uid: `f${i}`, name: `Ami ${i}` }, UID_ME);
    expect(list).toHaveLength(FRIENDS.max);
    expect(list[list.length - 1].uid).toBe('f59');
    expect(removeFriend(list, 'f59')).toBe(true);
    expect(removeFriend(list, 'f59')).toBe(false);
  });
  it('joueur d’avant le lot : liste vide ; liste reçue nettoyée (forme, doublons, borne)', () => {
    expect(normalizeMeta({ ...DEFAULT_META, friends: undefined }).friends).toEqual([]);
    expect(normalizeMeta({ version: 5, runs: 3 }).friends).toEqual([]);
    expect(
      normalizeFriends([
        { uid: UID_A, name: 'Jimmy' },
        { uid: UID_A, name: 'Double' },
        { uid: '../x', name: 'Mauvais' },
        { uid: UID_B, name: '<' },
        'texte',
      ]),
    ).toEqual([{ uid: UID_A, name: 'Jimmy' }]);
    const many = Array.from({ length: 80 }, (_, i) => ({ uid: `u${i}`, name: `Ami ${i}` }));
    expect(normalizeFriends(many)).toHaveLength(FRIENDS.max);
  });
  it('`friends` est une clé de progression synchronisée, bornée par les règles Firestore', () => {
    expect(PROGRESS_KEYS).toContain('friends');
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    expect(rules).toContain(`p().friends.size() <= ${FRIENDS.max}`);
    expect(rules).toContain("p().friends[0] is map && p().friends[0].keys().hasOnly(['uid', 'name'])");
    const local = normalizeMeta({ version: 5 });
    expect(withProgress(local, { friends: [{ uid: UID_A, name: 'Jimmy' }] }).friends).toEqual([
      { uid: UID_A, name: 'Jimmy' },
    ]);
  });
});

describe('The daily board shows you and your friends', () => {
  const doc = (name: string, time: number, kills: number): DayDoc => ({ name, time, kills, at: 1 });
  it('toi et tes amis, triés par temps puis par kills ; ceux qui n’ont pas joué à la fin', () => {
    const friends: Friend[] = [
      { uid: UID_A, name: 'Jimmy' },
      { uid: UID_B, name: 'Zoé' },
      { uid: 'c1', name: 'Lou' },
    ];
    const docs = new Map([
      [UID_ME, doc('Moi', 300, 380)],
      [UID_A, doc('Jimmy', 300, 412)],
      [UID_B, doc('Zoé2', 221, 900)],
    ]);
    const rows = friendRows({ uid: UID_ME, name: 'Moi' }, friends, docs);
    expect(rows.map((r) => [r.name, r.time, r.kills, r.played, r.me])).toEqual([
      ['Jimmy', 300, 412, true, false],
      ['Moi', 300, 380, true, true],
      ['Zoé2', 221, 900, true, false],
      ['Lou', 0, 0, false, false],
    ]);
  });
  it('la meilleure partie du jour ne peut que monter (temps, puis kills) ; bornes des règles Firestore', () => {
    const first = mergeDay(null, 200.9, 50, 'Moi', 1)!;
    expect(first).toEqual({ name: 'Moi', time: 200, kills: 50, at: 1 });
    expect(mergeDay(first, 150, 999, 'Moi', 2)).toBeNull();
    expect(mergeDay(first, 200, 60, 'Moi', 2)).toEqual({ name: 'Moi', time: 200, kills: 60, at: 2 });
    expect(mergeDay(first, 300, 10, 'Moi', 2)).toEqual({ name: 'Moi', time: 300, kills: 10, at: 2 });
    expect(mergeDay(first, 100, 1, 'Moi2', 3)).toEqual({ name: 'Moi2', time: 200, kills: 50, at: 3 });
    expect(mergeDay(null, 9999, 1e9, 'Moi', 1)).toMatchObject({ time: BOARD.dayTimeMax, kills: BOARD.dayKillsMax });
    expect(readDay({ name: '<b>', time: 1, kills: 1 })).toBeNull();
    expect(readDay({ name: 'Zoé', time: 1e6, kills: -4, at: 5 })).toEqual({ name: 'Zoé', time: 3600, kills: 0, at: 5 });
    const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
    const block = rules.slice(rules.indexOf('match /days/{day}/scores/{uid}'));
    expect(block).toContain("hasOnly(['name', 'time', 'kills', 'at', 'x'])");
    // relecture : expiration exigée (début du jour + 7 jours, règle TTL) et jour dans une fenêtre de J-2 à J+1
    expect(block).toContain(`d.x == dayStart() + duration.value(${BOARD.dayTtlDays}, 'd')`);
    expect(block).toContain("dayStart() > request.time - duration.value(3, 'd')");
    expect(block).toContain("dayStart() < request.time + duration.value(1, 'd')");
    expect(BOARD.dayWindow).toEqual([-2, 1]);
    expect(dayExpiry('2026-11-17')).toBe(Date.UTC(2026, 10, 24));
    const noon = Date.UTC(2026, 10, 17, 12);
    expect(
      ['2026-11-14', '2026-11-15', '2026-11-17', '2026-11-18', '2026-11-19'].map((d) => dayWritable(d, noon)),
    ).toEqual([false, true, true, true, false]);
    expect(dayWritable('nimporte', noon)).toBe(false);
    expect(block).toContain(`d.time <= ${BOARD.dayTimeMax}`);
    expect(block).toContain(`d.kills <= ${BOARD.dayKillsMax}`);
    expect(block).toContain('allow get: if request.auth != null');
    expect(block).toContain('request.query.limit <= 100');
    expect(block).toContain("day.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')");
    expect(BOARD.dayQuery).toBeLessThanOrEqual(30);
  });
});
