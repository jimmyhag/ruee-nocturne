// Localisation FR/EN (PLAN.md §5 phase 5) : deux fichiers JSON à clés plates, un `t()` minuscule.
// Aucun accès au DOM ni à `navigator` ici : testable sous Vitest (node), et la sim n'importe jamais ce module
// (src/sim/sim.test.ts l'interdit) : les textes vivent côté UI, la sim ne manipule que des clés.
import fr from './fr.json';
import en from './en.json';

export type Lang = 'fr' | 'en';
/** Réglage du joueur : `auto` suit la langue du navigateur. */
export type LangSetting = Lang | 'auto';
export const LANG_SETTINGS: readonly LangSetting[] = ['auto', 'fr', 'en'];
type Dict = Record<string, string>;
const FR: Dict = fr;
const DICTS: Record<Lang, Dict> = { fr: FR, en };
const LOCALE: Record<Lang, string> = { fr: 'fr-FR', en: 'en-US' };

let lang: Lang = 'fr';
const listeners = new Set<() => void>();

/** `auto` → français si le navigateur est en français, anglais sinon (la langue de la source est le français). */
export function resolveLang(setting: LangSetting, navigatorLanguage: string | undefined): Lang {
  if (setting === 'fr' || setting === 'en') return setting;
  return (navigatorLanguage ?? '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}
export function getLang(): Lang {
  return lang;
}
export function setLang(l: Lang): void {
  if (l === lang) return;
  lang = l;
  for (const cb of listeners) cb();
}
/** Abonnement au changement de langue (caches de libellés, ex. noms de boss du HUD). Retourne la désinscription. */
export function onLangChange(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function has(key: string): boolean {
  return key in DICTS[lang] || key in FR;
}

const NF: Partial<Record<Lang, Intl.NumberFormat>> = {};
/** Nombre dans la langue courante : « 2,2 » et « 2 000 » en français, « 2.2 » et « 2,000 » en anglais. */
export function fmtNum(n: number): string {
  return (NF[lang] ??= new Intl.NumberFormat(LOCALE[lang], { maximumFractionDigits: 2 })).format(n);
}
/** Durée `m:ss` (identique dans les deux langues). */
export function fmtTime(s: number): string {
  s = Math.floor(Math.max(0, s));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}
/** Rang : « 1er », « 2e » / « 1st », « 2nd », « 3rd », « 4th ». */
export function ordinal(n: number): string {
  if (lang === 'fr') return n === 1 ? '1er' : n + 'e';
  const r10 = n % 10,
    r100 = n % 100;
  const suf = r100 >= 11 && r100 <= 13 ? 'th' : r10 === 1 ? 'st' : r10 === 2 ? 'nd' : r10 === 3 ? 'rd' : 'th';
  return n + suf;
}

export type Params = Record<string, string | number>;
/**
 * Traduit `key` avec interpolation `{x}`. Si `params.n` est un nombre et que `key_one` / `key_other` existent,
 * la forme est choisie par `n` (français : 0 et 1 au singulier ; anglais : 1 seulement). Les nombres passent
 * par `fmtNum`. Clé inconnue : repli français, puis la clé elle-même.
 */
export function t(key: string, params?: Params): string {
  let k = key;
  if (params && typeof params.n === 'number') {
    const one = lang === 'fr' ? params.n < 2 : params.n === 1;
    const kk = key + (one ? '_one' : '_other');
    if (has(kk)) k = kk;
  }
  let s = DICTS[lang][k] ?? FR[k];
  if (s === undefined) {
    if (import.meta.env?.DEV) console.warn('i18n : clé manquante', key);
    return key;
  }
  if (params)
    s = s.replace(/\{(\w+)\}/g, (m, p: string) => {
      const v = params[p];
      return v === undefined ? m : typeof v === 'number' ? fmtNum(v) : v;
    });
  return s;
}
