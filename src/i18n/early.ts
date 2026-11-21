// Accueil traduit avant le premier affichage (docs/specs/accueil-rapide.md). Module pur (ni DOM ni fichier) :
// vite.config.ts lui passe index.html et en.json au build, et reçoit index.html avec un petit script en ligne, posé
// juste après l'accueil, qui en traduit les textes dès que l'analyseur l'atteint, sans attendre le script principal.
//
// L'accueil, c'est ce que le joueur voit au chargement : `#menu`, la barre d'onglets et sa bulle, tout ce qui va de
// `<section id="menu"` au marqueur. Les autres écrans restent traduits par main.ts (`applyLangStatic`).
// `data-i18n-early` : un texte par défaut que le code remplace ensuite (le nom du héros, rempli par src/ui/home.ts
// selon le héros choisi) ; traduit ici seulement, pour qu'il ne s'affiche pas en français d'ici là.

/** Marqueur d'index.html : fin de l'accueil, remplacé par le script précoce. */
const MARK = '<!-- accueil-traduit -->';
const START = '<section id="menu"';

/** Clés `data-i18n` et `data-i18n-attr` de l'accueil, dans l'ordre, sans doublon. */
function homeKeys(html: string): string[] {
  const a = html.indexOf(START),
    b = html.indexOf(MARK);
  if (a < 0 || b < a) throw new Error(`index.html : accueil introuvable (${START} … ${MARK})`);
  const part = html.slice(a, b);
  const keys = new Set<string>();
  for (const m of part.matchAll(/data-i18n(?:-early)?="([^"]+)"/g)) keys.add(m[1]);
  for (const m of part.matchAll(/data-i18n-attr="([^"]+)"/g))
    for (const pair of m[1].split(';')) keys.add(pair.slice(pair.indexOf(':') + 1));
  return [...keys];
}

/** Chaînes anglaises de l'accueil, tirées du fichier de traduction ; une clé sans traduction fait échouer le build. */
export function earlyStrings(html: string, en: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of homeKeys(html)) {
    if (!(k in en)) throw new Error(`en.json : clé de l'accueil sans traduction : ${k}`);
    out[k] = en[k];
  }
  return out;
}

/**
 * index.html avec le script précoce à la place du marqueur (une page sans marqueur, « À propos », reste telle quelle).
 * Le script ne fait rien si la langue décidée dans <head> (préférence du joueur, sinon navigateur) est le français ;
 * sinon il traduit les nœuds déjà lus, puis lève `lang-pending` : l'accueil apparaît, déjà en anglais.
 */
export function injectEarlyI18n(html: string, en: Record<string, string>): string {
  if (!html.includes(MARK)) return html;
  const dict = JSON.stringify(earlyStrings(html, en)).replace(/</g, '\\u003c');
  const js =
    `(function(){var h=document.documentElement;if(h.lang!=='en')return;var d=${dict},i,j,e,p;` +
    `var t=document.querySelectorAll('[data-i18n],[data-i18n-early]');for(i=0;i<t.length;i++){e=t[i];p=e.dataset.i18n||e.dataset.i18nEarly;if(d.hasOwnProperty(p))e.textContent=d[p];}` +
    `t=document.querySelectorAll('[data-i18n-attr]');for(i=0;i<t.length;i++){p=t[i].dataset.i18nAttr.split(';');` +
    `for(j=0;j<p.length;j++){e=p[j].split(':');if(d.hasOwnProperty(e[1]))t[i].setAttribute(e[0],d[e[1]]);}}` +
    `h.classList.remove('lang-pending');})();`;
  return html.replace(MARK, `<script>${js}</script>`);
}
