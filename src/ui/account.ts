// Panneau Compte (phase 13) : rendu DOM natif à partir d'un état. Ne connaît ni Firebase ni la sauvegarde :
// main.ts tient l'état, branche les boutons et appelle renderAccount après chaque changement.
import { fmtTime, t } from '../i18n';

export type AccountStatus = 'loading' | 'unavailable' | 'out' | 'in';
export type SyncState = 'idle' | 'syncing' | 'synced' | 'offline' | 'error';
export interface SaveSummary {
  time: number;
  gold: number;
  runs: number;
}
export interface AccountView {
  status: AccountStatus;
  email: string | null;
  sync: SyncState;
  busy: boolean; // une opération est en cours : boutons désactivés
  msg: string; // message déjà traduit (vide = rien)
  error: boolean; // le message est une erreur
  choice: { local: SaveSummary; cloud: SaveSummary } | null; // premier login avec deux progressions différentes
  iosHint: boolean; // app installée sur iOS : Google peut ne pas s'ouvrir
  askPassword: boolean; // suppression : le mot de passe est redemandé
  retry: boolean; // bouton « Réessayer » (chargement ou synchronisation en échec)
}

export function initialAccountView(iosHint: boolean): AccountView {
  return {
    status: 'loading',
    email: null,
    sync: 'idle',
    busy: false,
    msg: '',
    error: false,
    choice: null,
    iosHint,
    askPassword: false,
    retry: false,
  };
}

const $ = (id: string) => document.getElementById(id)!;
const summaryText = (key: string, s: SaveSummary) =>
  t(key, { time: fmtTime(s.time), gold: t('gold', { n: s.gold }), runs: t('runs', { n: s.runs }) });

/** Libellé du bouton du menu : « Compte » ou « Connecté · e-mail ». */
export function accountLabel(v: AccountView): string {
  return v.status === 'in' && v.email ? t('menu.accountIn', { email: v.email }) : t('menu.account');
}

export function renderAccount(v: AccountView): void {
  const status =
    v.status === 'loading'
      ? t('account.status.loading')
      : v.status === 'unavailable'
        ? t('account.status.unavailable')
        : v.status === 'in'
          ? t('account.status.in', { email: v.email ?? '' })
          : t('account.status.out');
  $('accStatus').textContent = status;
  const choosing = v.choice !== null;
  $('accSignedOut').hidden = v.status !== 'out' || choosing;
  $('accSignedIn').hidden = v.status !== 'in' || choosing;
  $('accChoice').hidden = !choosing;
  $('accIosHint').hidden = !v.iosHint;
  $('accDeletePwd').hidden = !v.askPassword;
  $('accRetryRow').hidden = !v.retry;
  const sync = $('accSync');
  sync.textContent = v.sync === 'idle' ? '' : t(`account.sync.${v.sync}`);
  if (v.choice) {
    $('accKeepLocal').textContent = summaryText('account.choice.local', v.choice.local);
    $('accKeepCloud').textContent = summaryText('account.choice.cloud', v.choice.cloud);
  }
  const msg = $('accMsg');
  msg.textContent = v.msg;
  msg.classList.toggle('error', v.error && v.msg !== '');
  for (const b of $('account').querySelectorAll<HTMLButtonElement>('button:not(#accountBackBtn)')) b.disabled = v.busy;
  $('accountBtn').textContent = accountLabel(v);
}

/** Code d'erreur Firebase (`auth/xxx`, `permission-denied`…) → clé i18n `account.err.*`, repli générique. */
const KNOWN_ERRORS = new Set([
  'invalid-email',
  'missing-password',
  'weak-password',
  'email-already-in-use',
  'invalid-credential',
  'too-many-requests',
  'network-request-failed',
  'popup-blocked',
  'popup-closed-by-user',
  'unauthorized-domain',
  'requires-recent-login',
  'user-disabled',
  'operation-not-allowed',
  'permission-denied',
  'unavailable',
]);
const ALIASES: Record<string, string> = {
  'wrong-password': 'invalid-credential',
  'user-not-found': 'invalid-credential',
  'invalid-login-credentials': 'invalid-credential',
  'cancelled-popup-request': 'popup-closed-by-user',
  'user-cancelled': 'popup-closed-by-user',
  'internal-error': 'generic',
  'web-storage-unsupported': 'generic',
  'operation-not-supported-in-this-environment': 'popup-blocked',
};
export function errorKey(e: unknown): string {
  const raw =
    e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string'
      ? (e as { code: string }).code
      : '';
  const code = raw.replace(/^auth\//, '');
  const k = ALIASES[code] ?? code;
  return KNOWN_ERRORS.has(k) ? `account.err.${k}` : 'account.err.generic';
}
