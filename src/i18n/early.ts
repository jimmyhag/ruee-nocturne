// Accueil traduit avant le premier affichage (docs/specs/accueil-rapide.md). Module pur (ni DOM ni fichier) :
// vite.config.ts lui passe index.html et en.json au build, et reçoit index.html avec un petit script en ligne, posé
// juste après l'accueil, qui en traduit les textes dès que l'analyseur l'atteint, sans attendre le script principal.
//
// L'accueil, c'est ce que le joueur voit au chargement : `#menu`, la barre d'onglets et sa bulle, tout ce qui va de
// `<section id="menu"` au marqueur. Les autres écrans restent traduits par main.ts (`applyLangStatic`).
// `data-i18n-early` : un texte par défaut que le code remplace ensuite (le nom du héros, rempli par src/ui/home.ts
// selon le héros choisi) ; traduit ici seulement, pour qu'il ne s'affiche pas en français d'ici là.
//
// Premier lancement (docs/specs/demarrage-rapide.md) : l'aide « Comment jouer » est le premier écran d'un nouveau
// joueur. Le script de <head> le décide (classe `help-due`) ; un second script, posé juste après l'aide, la traduit et
// l'affiche dans l'état exact où main.ts la mettra (`setHelpFirst(true)` puis `openScreen('help')` : sans flèche
// retour ni « Rejouer la partie guidée », systèmes non dévoilés masqués, « Jouer » au focus hors tactile). « Jouer »
// touché d'ici là est noté (`data-early`) : main.ts lance la partie guidée dès qu'il reprend l'aide. Le premier geste
// (appui, touche) est noté aussi (`data-touched` sur <html>, son instant) : main.ts prépare alors la scène comme après
// un premier geste.

/** Marqueur d'index.html : fin de l'accueil, remplacé par le script précoce. */
const MARK = '<!-- accueil-traduit -->';
const START = '<section id="menu"';
/** Marqueur d'index.html : fin de l'aide, remplacé par le script du premier lancement. */
const HELP_MARK = '<!-- aide-premiere -->';
const HELP_START = '<section id="help"';

/**
 * Touches de l'aide (`data-key`) pour un nouveau joueur, qui a les touches par défaut : clé de traduction de leur nom
 * (ce que renvoie `keyText` de src/ui/keys.ts sans réglage ; test src/ui/keys.test.ts).
 */
export const DEFAULT_CAPS: Readonly<Record<string, string>> = {
  move: 'menu.keys.move',
  jump: 'keys.space',
  spell: 'keys.shift',
};

/** Partie d'index.html entre `start` et `mark`. */
function part(html: string, start: string, mark: string): string {
  const a = html.indexOf(start),
    b = html.indexOf(mark);
  if (a < 0 || b < a) throw new Error(`index.html : écran introuvable (${start} … ${mark})`);
  return html.slice(a, b);
}

/** Clés `data-i18n` et `data-i18n-attr` d'un morceau d'index.html, dans l'ordre, sans doublon. */
function keysOf(html: string): string[] {
  const keys = new Set<string>();
  for (const m of html.matchAll(/data-i18n(?:-early)?="([^"]+)"/g)) keys.add(m[1]);
  for (const m of html.matchAll(/data-i18n-attr="([^"]+)"/g))
    for (const pair of m[1].split(';')) keys.add(pair.slice(pair.indexOf(':') + 1));
  return [...keys];
}

/** Chaînes anglaises des clés, tirées du fichier de traduction ; une clé sans traduction fait échouer le build. */
function stringsOf(keys: string[], en: Record<string, string>, what: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    if (!(k in en)) throw new Error(`en.json : clé ${what} sans traduction : ${k}`);
    out[k] = en[k];
  }
  return out;
}

/** Chaînes anglaises de l'accueil, tirées du fichier de traduction ; une clé sans traduction fait échouer le build. */
export function earlyStrings(html: string, en: Record<string, string>): Record<string, string> {
  return stringsOf(keysOf(part(html, START, MARK)), en, "de l'accueil");
}

/**
 * Chaînes anglaises de l'aide telle qu'un nouveau joueur la voit : sans les lignes des systèmes pas encore dévoilés
 * (`data-reveal`, masquées), et le nom de ses touches par défaut (`caps`).
 */
export function helpStrings(
  html: string,
  en: Record<string, string>,
): { text: Record<string, string>; caps: Record<string, string> } {
  const help = part(html, HELP_START, HELP_MARK);
  const shown = help.replace(/<div data-reveal="\d+">[\s\S]*?<\/div>/g, '');
  const caps: Record<string, string> = {};
  for (const m of shown.matchAll(/data-key="([^"]+)"/g)) {
    const k = DEFAULT_CAPS[m[1]];
    if (!k) throw new Error(`aide : touche sans nom par défaut : ${m[1]}`);
    caps[m[1]] = stringsOf([k], en, "de l'aide")[k];
  }
  return { text: stringsOf(keysOf(shown), en, "de l'aide"), caps };
}

const json = (o: unknown): string => JSON.stringify(o).replace(/</g, '\\u003c');

/**
 * index.html avec le script précoce à la place du marqueur (une page sans marqueur, « À propos », reste telle quelle).
 * Le script ne fait rien si la langue décidée dans <head> (préférence du joueur, sinon navigateur) est le français ;
 * sinon il traduit les nœuds déjà lus, puis lève `lang-pending` : l'accueil apparaît, déjà en anglais.
 * Puis le script du premier lancement à la place du marqueur de l'aide. `dev` (serveur de Vite) : comme main.ts en
 * développement, l'aide ne s'ouvre qu'avec `?help=1`.
 */
export function injectEarlyI18n(html: string, en: Record<string, string>, dev = false): string {
  let out = html;
  if (out.includes(MARK)) {
    const dict = json(earlyStrings(out, en));
    const js =
      `(function(){var h=document.documentElement;if(h.lang!=='en')return;var d=${dict},i,j,e,p;` +
      `var t=document.querySelectorAll('[data-i18n],[data-i18n-early]');for(i=0;i<t.length;i++){e=t[i];p=e.dataset.i18n||e.dataset.i18nEarly;if(d.hasOwnProperty(p))e.textContent=d[p];}` +
      `t=document.querySelectorAll('[data-i18n-attr]');for(i=0;i<t.length;i++){p=t[i].dataset.i18nAttr.split(';');` +
      `for(j=0;j<p.length;j++){e=p[j].split(':');if(d.hasOwnProperty(e[1]))t[i].setAttribute(e[0],d[e[1]]);}}` +
      `h.classList.remove('lang-pending');})();`;
    out = out.replace(MARK, `<script>${js}</script>`);
  }
  if (out.includes(HELP_MARK)) {
    const s = helpStrings(out, en);
    const js =
      `(function(){var h=document.documentElement,g=function(x){return document.getElementById(x)},p,t,i,j,e,k;` +
      `if(!h.classList.contains('help-due'))return;` +
      (dev ? `if(location.search.indexOf('help=1')<0){h.classList.remove('help-due');return;}` : '') +
      `p=g('help');if(h.lang==='en'){var d=${json(s.text)},c=${json(s.caps)};` +
      `t=p.querySelectorAll('[data-i18n]');for(i=0;i<t.length;i++){k=t[i].dataset.i18n;if(d.hasOwnProperty(k))t[i].textContent=d[k];}` +
      `t=p.querySelectorAll('[data-i18n-attr]');for(i=0;i<t.length;i++){e=t[i].dataset.i18nAttr.split(';');` +
      `for(j=0;j<e.length;j++){k=e[j].split(':');if(d.hasOwnProperty(k[1]))t[i].setAttribute(k[0],d[k[1]]);}}` +
      `t=p.querySelectorAll('[data-key]');for(i=0;i<t.length;i++){k=t[i].dataset.key;if(c.hasOwnProperty(k))t[i].textContent=c[k];}}` +
      `t=p.querySelectorAll('[data-reveal]');for(i=0;i<t.length;i++)t[i].hidden=true;` +
      `g('helpBackBtn').hidden=true;g('helpTutoBtn').hidden=true;document.body.classList.add('help-first');` +
      `g('menu').hidden=true;p.hidden=false;h.classList.remove('help-due');` +
      `p=g('helpPlayBtn');p.onclick=function(){p.dataset.early='1'};` +
      `var v=['pointerdown','keydown','touchstart'],u=function(){h.dataset.touched=String(Math.round(performance.now()));` +
      `for(j=0;j<v.length;j++)removeEventListener(v[j],u,true)};` +
      `for(i=0;i<v.length;i++)addEventListener(v[i],u,{capture:true,passive:true});` +
      `if(!matchMedia('(pointer: coarse)').matches)p.focus({preventScroll:true});})();`;
    out = out.replace(HELP_MARK, `<script>${js}</script>`);
  }
  return out;
}
