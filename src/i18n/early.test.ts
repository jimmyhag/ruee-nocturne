// Accueil traduit avant le premier affichage (docs/specs/accueil-rapide.md, scénario 3) : chaque texte de l'accueil
// a sa chaîne anglaise dans le script précoce, tirée de en.json ; le script reste petit et ne fait rien en français.
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import en from './en.json';
import { earlyStrings, injectEarlyI18n } from './early';

const EN = en as Record<string, string>;
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
