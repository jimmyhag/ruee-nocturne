// Un premier lancement rapide (docs/specs/demarrage-rapide.md, décision 1) : le script en ligne du <head> d'index.html
// décide le premier écran (l'aide du premier lancement ou l'accueil) avec les informations que lira main.ts. Ce test
// l'exécute sur des sauvegardes de toutes formes et compare sa décision à celle de main.ts : `peekMeta` (sauvegarde
// locale normalisée), `tutorialDue`, le lien de défi et le mode debug (`debugEnabled`, sauf `?help=1`).
import { readFileSync } from 'node:fs';
import { Script, createContext } from 'node:vm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { peekMeta } from './save';
import { isChallengeHash } from './share-card';
import { tutorialDue } from './tutorial';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));
const script = new Script(/<script>([\s\S]*?)<\/script>/.exec(head)![1]);

interface Page {
  raw: string | null; // contenu de `ruee-meta` (null : absent)
  blocked?: boolean; // localStorage lève une exception
  hash?: string;
  search?: string;
  language?: string;
}

// Une seule page factice (un contexte par lancement serait trop lent pour le corpus) ; `page` est la page courante.
let page: Page = { raw: null };
const classes = new Set<string>();
const preload: string[] = [];
const storage = {
  getItem: (): string | null => {
    if (page.blocked) throw new Error('bloqué');
    return page.raw;
  },
};
const documentElement = {
  lang: 'fr',
  classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
};
const loc = { hash: '', search: '' };
const nav = { language: 'fr-FR' };
const ctx = createContext({
  localStorage: storage,
  navigator: nav,
  location: loc,
  setTimeout: () => 0,
  document: {
    documentElement,
    createElement: () => ({}),
    head: { appendChild: (l: { rel: string; href: string }) => preload.push(`${l.rel} ${l.href}`) },
  },
});

/** Le script de <head> sur la page `p` : l'aide est-elle décidée, sa police préchargée, et la langue ? */
function inline(p: Page): { help: boolean; preload: string[]; lang: string; pending: boolean } {
  page = p;
  classes.clear();
  preload.length = 0;
  documentElement.lang = 'fr';
  loc.hash = p.hash ?? '';
  loc.search = p.search ?? '';
  nav.language = p.language ?? 'fr-FR';
  script.runInContext(ctx);
  return {
    help: classes.has('help-due'),
    preload: [...preload],
    lang: documentElement.lang,
    pending: classes.has('lang-pending'),
  };
}

/** La décision de main.ts au même lancement (src/main.ts, « premier lancement »), lien de défi valide. */
function main(p: Page): boolean {
  page = p;
  const meta = peekMeta();
  const search = p.search ?? '';
  const linked = isChallengeHash(p.hash ?? '');
  return !linked && !meta.seenHelp && (!search.includes('debug') || search.includes('help=1')) && tutorialDue(meta);
}

beforeAll(() => vi.stubGlobal('localStorage', storage));
afterAll(() => vi.unstubAllGlobals());

describe('premier écran décidé par la page', () => {
  it('decides the help exactly when main.ts opens it for a new player, whatever the save', () => {
    const fields = {
      version: [undefined, 2, 3, 5],
      seenHelp: [undefined, true, false, 'yes'],
      runs: [undefined, 0, 1, -1, 0.5, '2'],
      stats: [undefined, { runs: 0 }, { runs: 2 }],
      reveal: [undefined, 0, 1, -2, 0.7, '1'],
      tutorial: [undefined, 0, 1, 0.9, -1, 7, '0'],
    };
    let saves = [{}] as Record<string, unknown>[];
    for (const [k, vals] of Object.entries(fields))
      saves = saves.flatMap((s) => vals.map((v) => (v === undefined ? s : { ...s, [k]: v })));
    expect(saves.length).toBe(4 * 4 * 6 * 3 * 6 * 7);
    let helps = 0;
    for (const s of saves) {
      const p = { raw: JSON.stringify(s) };
      const want = main(p);
      expect(inline(p).help, p.raw).toBe(want);
      if (want) helps++;
    }
    expect(helps).toBeGreaterThan(100); // le corpus contient bien des nouveaux joueurs
  });

  it('a missing, unreadable or blocked save is a new player, as for peekMeta', () => {
    for (const p of [
      { raw: null },
      { raw: '' },
      { raw: 'null' },
      { raw: '{oups' },
      { raw: '[]' },
      { raw: '42' },
      { raw: '"x"' },
      { raw: null, blocked: true },
    ]) {
      expect(main(p), String(p.raw)).toBe(true);
      expect(inline(p).help, String(p.raw)).toBe(true);
    }
  });

  it('a challenge link and the test mode do not show the help first; ?help=1 still does', () => {
    const fresh = { raw: null };
    const cases = [
      { ...fresh, hash: '#defi=2026-11-20&t=300&k=412' },
      { ...fresh, hash: 'defi=2026-11-20' },
      { ...fresh, hash: '#autre' },
      { ...fresh, search: '?debug=1' },
      { ...fresh, search: '?debug=1&tuto=1&help=1' },
    ];
    expect(cases.map((p) => inline(p).help)).toEqual([false, false, true, false, true]);
    for (const p of cases) expect(inline(p).help).toBe(main(p));
  });

  it('the help preloads the weight of its key caps; the home screen loads nothing more', () => {
    expect(inline({ raw: null }).preload).toEqual(['preload /fonts/barlow-condensed-600-latin.woff2']);
    expect(inline({ raw: JSON.stringify({ version: 5, seenHelp: true }) }).preload).toEqual([]);
    expect(html).toContain('src: url(/fonts/barlow-condensed-600-latin.woff2)'); // la police existe dans la page
  });

  it('the language decision is unchanged: the player first, then the browser; French when storage is blocked', () => {
    expect(inline({ raw: null, language: 'en-US' })).toMatchObject({ lang: 'en', pending: true });
    expect(inline({ raw: null, language: 'fr-FR' })).toMatchObject({ lang: 'fr', pending: false });
    const fr = JSON.stringify({ settings: { lang: 'fr' } }),
      en = JSON.stringify({ settings: { lang: 'en' } });
    expect(inline({ raw: fr, language: 'en-US' })).toMatchObject({ lang: 'fr', pending: false });
    expect(inline({ raw: en, language: 'fr-FR' })).toMatchObject({ lang: 'en', pending: true });
    expect(inline({ raw: null, blocked: true, language: 'en-US' })).toMatchObject({ lang: 'fr', pending: false });
  });
});
