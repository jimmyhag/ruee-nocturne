// Accueil traduit avant le premier affichage (docs/specs/accueil-rapide.md, scénario 3) : chaque texte de l'accueil
// a sa chaîne anglaise dans le script précoce, tirée de en.json ; le script reste petit et ne fait rien en français.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import fr from './fr.json';
import { earlyStrings, injectEarlyI18n } from './early';

const EN = en as Record<string, string>;
const FR = fr as Record<string, string>;
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const MARK = '<!-- accueil-traduit -->';

/** Le script précoce tel qu'il sort du build. */
const script = (): string => {
  const out = injectEarlyI18n(html, EN);
  const m = /<script>(\(function\(\)\{var h=document\.documentElement;[\s\S]*?)<\/script>/.exec(out);
  if (!m) throw new Error('script précoce absent');
  return m[1];
};

/** Exécute le script précoce sur un document factice : `lang` du <html>, nœuds `data-i18n` et `data-i18n-attr`. */
function runEarly(lang: string) {
  const classes = new Set(['lang-pending']);
  const play = { dataset: { i18n: 'menu.play' }, textContent: 'Jouer' };
  const other = { dataset: { i18n: 'hud.level' }, textContent: 'Niv' }; // hors de l'accueil : laissé à main.ts
  const hero = { dataset: { i18nEarly: 'char.eclaireuse.name' }, textContent: 'Éclaireuse' };
  const attrs: Record<string, string> = {};
  const nav = {
    dataset: { i18nAttr: 'aria-label:menu.nav' },
    setAttribute: (a: string, v: string) => (attrs[a] = v),
  };
  const document = {
    documentElement: { lang, classList: { remove: (c: string) => classes.delete(c) } },
    querySelectorAll: (sel: string) => (sel === '[data-i18n-attr]' ? [nav] : [play, other, hero]),
  };
  runInNewContext(script(), { document });
  return {
    play: play.textContent,
    other: other.textContent,
    hero: hero.textContent,
    nav: attrs['aria-label'],
    pending: classes.has('lang-pending'),
  };
}

describe('accueil traduit avant le premier affichage', () => {
  it('Each home screen text has its early translation', () => {
    // les nœuds traduisibles de l'accueil, relevés ici indépendamment du module : #menu, barre d'onglets et bulle
    const part = html.slice(html.indexOf('<section id="menu"'), html.indexOf(MARK));
    expect(part.length).toBeGreaterThan(1000);
    const keys = [...part.matchAll(/data-i18n(?:-early)?="([^"]+)"/g)].map((m) => m[1]);
    for (const m of part.matchAll(/data-i18n-attr="([^"]+)"/g))
      for (const pair of m[1].split(';')) keys.push(pair.split(':')[1]);
    expect(keys).toContain('menu.play');
    expect(keys).toContain('menu.characters'); // barre d'onglets
    expect(keys).toContain('char.eclaireuse.name'); // nom du héros par défaut, remplacé ensuite par src/ui/home.ts
    const dict = JSON.parse(/var d=(\{[\s\S]*?\}),i,j/.exec(script())![1]) as Record<string, string>;
    for (const k of keys) expect(dict[k], k).toBe(EN[k]);
    expect(Object.keys(dict).sort()).toEqual([...new Set(keys)].sort()); // rien d'autre que l'accueil
  });

  it('the early script is small and stands alone', () => {
    const js = script();
    expect(gzipSync(js).length).toBeLessThan(2048); // décision 4 : quelques ko gzip au plus
    expect(js).not.toMatch(/\bimport\b|three|sim\//);
    expect(html.indexOf(MARK)).toBeLessThan(html.indexOf('<script type="module"')); // avant le script principal
  });

  it('in English it translates the home screen and shows it; in French it does nothing', () => {
    expect(runEarly('en')).toEqual({ play: 'Play', other: 'Niv', hero: 'Scout', nav: EN['menu.nav'], pending: false });
    expect(runEarly('fr')).toEqual({ play: 'Jouer', other: 'Niv', hero: 'Éclaireuse', nav: undefined, pending: true });
  });

  it('a home key without its English string fails the build; a page without the marker is left as is', () => {
    const missing = { ...EN };
    delete missing['menu.play'];
    expect(() => earlyStrings(html, missing)).toThrow(/menu\.play/);
    const about = '<html><body><p data-i18n="menu.play">Jouer</p></body></html>';
    expect(injectEarlyI18n(about, EN)).toBe(about);
  });
});

// Un premier lancement rapide (docs/specs/demarrage-rapide.md, décision 1) : le script posé après l'aide l'affiche,
// traduite, dans l'état où main.ts la met pour un nouveau joueur, quand le script de <head> l'a décidée (`help-due`).
const HELP_MARK = '<!-- aide-premiere -->';

/** Le script de l'aide tel qu'il sort du build (`dev` : serveur de Vite). */
const helpScript = (dev = false): string => {
  const out = injectEarlyI18n(html, EN, dev);
  const m = /<script>(\(function\(\)\{var h=document\.documentElement,g=[\s\S]*?)<\/script>/.exec(out);
  if (!m) throw new Error("script de l'aide absent");
  return m[1];
};

/** Exécute le script de l'aide sur une aide factice. */
function runHelp(o: { lang: string; due: boolean; coarse?: boolean; dev?: boolean; search?: string }) {
  const root = new Set(o.due ? ['help-due'] : []);
  const rootData: Record<string, string> = {};
  const body = new Set<string>();
  const el = <T extends object>(id: string, extra: T = {} as T) => ({
    id,
    hidden: false,
    dataset: {} as Record<string, string>,
    textContent: '',
    ...extra,
  });
  const title = el('', { dataset: { i18n: 'help.title' }, textContent: 'Comment jouer' });
  const daily = el('', { dataset: { i18n: 'menu.ctrl.daily' }, textContent: 'Défi du jour' });
  const skull = el('', { dataset: { i18n: 'menu.ctrl.skull' }, textContent: 'Crânes' }); // ligne non dévoilée
  const row = el('', { dataset: { reveal: '4' } });
  const move = el('', { dataset: { key: 'move' }, textContent: 'ZQSD' });
  const attrs: Record<string, string> = {};
  const back = el('helpBackBtn', {
    dataset: { i18nAttr: 'aria-label:menu.backShort' },
    setAttribute: (a: string, v: string) => (attrs[a] = v),
  });
  let focused = false;
  const play = el('helpPlayBtn', {
    dataset: { i18n: 'menu.play' },
    textContent: 'Jouer',
    focus: () => (focused = true),
    onclick: null as null | (() => void),
  });
  const lists: Record<string, object[]> = {
    '[data-i18n]': [title, daily, skull, play],
    '[data-i18n-attr]': [back],
    '[data-key]': [move],
    '[data-reveal]': [row],
  };
  const help = el('help', { hidden: true, querySelectorAll: (sel: string) => lists[sel] ?? [] });
  const menu = el('menu');
  const tuto = el('helpTutoBtn');
  const byId: Record<string, object> = { help, menu, helpBackBtn: back, helpTutoBtn: tuto, helpPlayBtn: play };
  const document = {
    documentElement: {
      lang: o.lang,
      dataset: rootData,
      classList: { contains: (c: string) => root.has(c), remove: (c: string) => root.delete(c) },
    },
    body: { classList: { add: (c: string) => body.add(c) } },
    getElementById: (id: string) => byId[id],
  };
  // écouteurs de la fenêtre : premier geste noté sur <html>
  const listeners = new Map<string, () => void>();
  runInNewContext(helpScript(o.dev), {
    document,
    location: { search: o.search ?? '' },
    matchMedia: () => ({ matches: !!o.coarse }),
    performance: { now: () => 1234.4 },
    addEventListener: (type: string, f: () => void, opts: { capture: boolean; passive: boolean }) => {
      if (opts.capture && opts.passive) listeners.set(type, f);
    },
    removeEventListener: (type: string, f: () => void, capture: boolean) => {
      if (capture && listeners.get(type) === f) listeners.delete(type);
    },
  });
  return {
    shown: !help.hidden,
    menu: !menu.hidden,
    back: !back.hidden,
    tuto: !tuto.hidden,
    helpFirst: body.has('help-first'),
    due: root.has('help-due'),
    row: !row.hidden,
    texts: [title.textContent, daily.textContent, skull.textContent, play.textContent, move.textContent],
    backLabel: attrs['aria-label'],
    focused,
    press: () => {
      play.onclick?.();
      return play.dataset.early;
    },
    listened: () => [...listeners.keys()].sort(),
    gesture: (type: string) => {
      listeners.get(type)?.();
      return rootData.touched;
    },
  };
}

describe('aide du premier lancement affichée par la page', () => {
  it('Each help text a new player sees has its early translation', () => {
    // l'aide d'un nouveau joueur, relevée ici indépendamment du module : sans les lignes non dévoilées (`data-reveal`)
    const part = html.slice(html.indexOf('<section id="help"'), html.indexOf(HELP_MARK));
    expect(part.length).toBeGreaterThan(1000);
    const shown = part.replace(/<div data-reveal="\d+">[\s\S]*?<\/div>/g, '');
    const keys = [...shown.matchAll(/data-i18n="([^"]+)"/g)].map((m) => m[1]);
    for (const m of shown.matchAll(/data-i18n-attr="([^"]+)"/g))
      for (const pair of m[1].split(';')) keys.push(pair.split(':')[1]);
    expect(keys).toContain('menu.ctrl.daily'); // l'élément LCP de Lighthouse sur un profil vierge
    expect(keys).not.toContain('menu.ctrl.skull');
    const js = helpScript();
    const dict = JSON.parse(/var d=(\{[\s\S]*?\}),c=/.exec(js)![1]) as Record<string, string>;
    for (const k of keys) expect(dict[k], k).toBe(EN[k]);
    expect(Object.keys(dict).sort()).toEqual([...new Set(keys)].sort());
    const caps = JSON.parse(/,c=(\{[\s\S]*?\});/.exec(js)![1]) as Record<string, string>;
    expect(caps).toEqual({ move: EN['menu.keys.move'], jump: EN['keys.space'], spell: EN['keys.shift'] });
    expect(gzipSync(js).length).toBeLessThan(2048); // petit, comme le script de l'accueil
    expect(html.indexOf(HELP_MARK)).toBeLessThan(html.indexOf('<script type="module"')); // avant le script principal
  });

  it("the help's French text in the page is the one of fr.json", () => {
    // affichée par la page avant main.ts, l'aide ne doit pas changer de texte (ni de hauteur) quand il la reprend
    const part = html.slice(html.indexOf('<section id="help"'), html.indexOf(HELP_MARK));
    let n = 0;
    for (const m of part.matchAll(/data-i18n="([^"]+)"[^>]*>([^<]*)</g)) {
      expect(m[2].trim().replace(/\s+/g, ' '), m[1]).toBe(FR[m[1]]);
      n++;
    }
    expect(n).toBeGreaterThan(10);
  });

  it('in English it translates the help and shows it as main.ts leaves it for a new player', () => {
    const r = runHelp({ lang: 'en', due: true });
    expect(r).toMatchObject({ shown: true, menu: false, back: false, tuto: false, helpFirst: true, due: false });
    expect(r.row).toBe(false); // systèmes non dévoilés masqués (`showRevealed` à 0)
    expect(r.texts).toEqual([EN['help.title'], EN['menu.ctrl.daily'], 'Crânes', 'Play', 'WASD']);
    expect(r.backLabel).toBe(EN['menu.backShort']);
    expect(r.focused).toBe(true); // « Jouer » au focus, comme main.ts hors tactile
    expect(runHelp({ lang: 'en', due: true, coarse: true }).focused).toBe(false);
  });

  it('in French it shows the help as written; without the decision of <head> it does nothing', () => {
    const fr = runHelp({ lang: 'fr', due: true });
    expect(fr).toMatchObject({ shown: true, menu: false, helpFirst: true, row: false, due: false });
    expect(fr.texts).toEqual(['Comment jouer', 'Défi du jour', 'Crânes', 'Jouer', 'ZQSD']);
    expect(runHelp({ lang: 'en', due: false })).toMatchObject({ shown: false, menu: true, helpFirst: false });
    // serveur de Vite : comme main.ts en développement, l'aide attend ?help=1
    expect(runHelp({ lang: 'fr', due: true, dev: true })).toMatchObject({ shown: false, menu: true, due: false });
    expect(runHelp({ lang: 'fr', due: true, dev: true, search: '?help=1' }).shown).toBe(true);
  });

  it('a press on Play before the main script is noted for it', () => {
    expect(runHelp({ lang: 'fr', due: true }).press()).toBe('1');
  });

  it('the first gesture before the main script is noted with its time, once', () => {
    const r = runHelp({ lang: 'fr', due: true });
    expect(r.listened()).toEqual(['keydown', 'pointerdown', 'touchstart']);
    expect(r.gesture('touchstart')).toBe('1234'); // l'instant, pour que main.ts compte le repos à partir de lui
    expect(r.listened()).toEqual([]); // un seul geste noté
    expect(runHelp({ lang: 'fr', due: false }).listened()).toEqual([]); // sans aide : main.ts écoute lui-même
  });
});
