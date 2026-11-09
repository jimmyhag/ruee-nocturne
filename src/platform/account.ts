// Compte du joueur (phase 13) : Firebase Authentication (Google, e-mail / mot de passe) et Cloud Firestore (lite).
// Seul fichier du projet qui importe `firebase/*` : main.ts le charge par import() quand le joueur ouvre le panneau Compte
// ou qu'une session est connue, jamais au premier chargement (Lighthouse). La logique de fusion est dans src/meta/sync.ts.
import { initializeApp } from 'firebase/app';
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  browserLocalPersistence,
  browserPopupRedirectResolver,
  createUserWithEmailAndPassword,
  deleteUser,
  getRedirectResult,
  indexedDBLocalPersistence,
  initializeAuth,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import type { Auth, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  setDoc,
} from 'firebase/firestore/lite';
import type { Firestore } from 'firebase/firestore/lite';
import { SYNC, fromCloudDoc } from '../meta/sync';
import type { CloudDoc } from '../meta/sync';
import { BOARD, isoWeek, mergeScore, readScore } from '../meta/board';
import type { BoardRow, BoardView, RunScore, ScoreDoc } from '../meta/board';

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  [k: string]: unknown;
}
const CONFIG_KEY = 'ruee-firebase-config';
const CONFIG_URL = '/__/firebase/init.json'; // URL réservée de Firebase Hosting : la config de l'app web liée au site

/**
 * Configuration : .env.local en dev (VITE_FIREBASE_CONFIG), sinon l'URL réservée de Hosting (mise en cache dans
 * localStorage pour les lancements hors ligne), sinon la copie en cache. null = comptes indisponibles.
 */
export async function loadConfig(): Promise<FirebaseConfig | null> {
  const env = import.meta.env.VITE_FIREBASE_CONFIG;
  if (env) {
    try {
      const c = fix(JSON.parse(env));
      if (c) return c;
    } catch {
      /* JSON invalide : on continue */
    }
  }
  try {
    const r = await fetch(CONFIG_URL, { cache: 'no-store' });
    // vite preview répond index.html (200, text/html) à toute URL inconnue : vérifier le type, pas seulement le statut
    if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) {
      const c = fix(await r.json());
      if (c) {
        try {
          localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
        } catch {
          /* stockage bloqué */
        }
        return c;
      }
    }
  } catch {
    /* hors ligne */
  }
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (raw) return fix(JSON.parse(raw));
  } catch {
    /* rien en cache */
  }
  return null;
}

/** Vérifie la forme et aligne authDomain sur l'hôte courant quand il sert /__/auth/* (Safari : pas de stockage tiers). */
function fix(c: unknown): FirebaseConfig | null {
  if (!c || typeof c !== 'object') return null;
  const o = c as Record<string, unknown>;
  if (typeof o.apiKey !== 'string' || typeof o.projectId !== 'string' || typeof o.appId !== 'string') return null;
  const host = location.hostname;
  const authDomain = /\.(web\.app|firebaseapp\.com)$/.test(host)
    ? host
    : typeof o.authDomain === 'string'
      ? o.authDomain
      : `${o.projectId}.firebaseapp.com`;
  return { ...o, apiKey: o.apiKey, projectId: o.projectId, appId: o.appId, authDomain };
}

export type Provider = 'google' | 'password' | 'other';
export interface AccountUser {
  uid: string;
  email: string | null;
  name: string | null; // phase 38 : nom du compte (Google), pour proposer un pseudo
  provider: Provider;
}
function toUser(u: User | null): AccountUser | null {
  if (!u) return null;
  const ids = u.providerData.map((p) => p.providerId);
  const provider: Provider = ids.includes('google.com') ? 'google' : ids.includes('password') ? 'password' : 'other';
  return { uid: u.uid, email: u.email, name: u.displayName, provider };
}
const code = (e: unknown): string =>
  e && typeof e === 'object' && typeof (e as { code?: unknown }).code === 'string' ? (e as { code: string }).code : '';
/** Le popup ne marche pas ici (bloqué, PWA installée) : on passe par la redirection. */
const REDIRECT_FALLBACK = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

export class Account {
  user: AccountUser | null = null;
  /** Premier état d'authentification connu (sinon le panneau afficherait « Pas connecté » le temps de la restauration). */
  ready = false;
  onChange: ((u: AccountUser | null) => void) | null = null;
  private readonly auth: Auth;
  private readonly db: Firestore;

  constructor(cfg: FirebaseConfig) {
    const app = initializeApp(cfg);
    this.auth = initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence],
      popupRedirectResolver: browserPopupRedirectResolver,
    });
    this.db = getFirestore(app);
    onAuthStateChanged(this.auth, (u) => {
      this.user = toUser(u);
      this.ready = true;
      this.onChange?.(this.user);
    });
  }

  /** Consomme le retour d'une connexion Google par redirection (sans effet s'il n'y en a pas). */
  async finishRedirect(): Promise<void> {
    await getRedirectResult(this.auth);
  }

  async signInGoogle(): Promise<void> {
    const p = new GoogleAuthProvider();
    try {
      await signInWithPopup(this.auth, p);
    } catch (e) {
      if (!REDIRECT_FALLBACK.has(code(e))) throw e;
      try {
        sessionStorage.setItem(SYNC.redirectKey, '1'); // au retour, main.ts charge ce module tout de suite
      } catch {
        /* stockage bloqué : la redirection marchera quand même, le résultat sera lu au prochain panneau */
      }
      await signInWithRedirect(this.auth, p);
    }
  }
  async signUpEmail(email: string, password: string): Promise<void> {
    await createUserWithEmailAndPassword(this.auth, email, password);
  }
  async signInEmail(email: string, password: string): Promise<void> {
    await signInWithEmailAndPassword(this.auth, email, password);
  }
  async resetPassword(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }
  async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  /**
   * Supprime la sauvegarde en ligne puis le compte. Firebase exige une connexion récente : on réauthentifie
   * (popup Google, ou mot de passe fourni) et on recommence ; sans mot de passe l'erreur remonte au panneau.
   */
  async deleteAccount(password?: string): Promise<void> {
    const u = this.auth.currentUser;
    if (!u) return;
    const ref = doc(this.db, 'saves', u.uid);
    try {
      await this.deleteScores(u.uid); // phase 38 : le classement oublie le joueur
      await deleteDoc(ref);
      await deleteUser(u);
    } catch (e) {
      if (code(e) !== 'auth/requires-recent-login') throw e;
      if (this.user?.provider === 'password') {
        if (!password) throw e;
        await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email ?? '', password));
      } else await reauthenticateWithPopup(u, new GoogleAuthProvider());
      await deleteDoc(ref);
      await deleteUser(u);
    }
  }

  async readSave(uid: string): Promise<CloudDoc | null> {
    const snap = await getDoc(doc(this.db, 'saves', uid));
    return snap.exists() ? fromCloudDoc(snap.data()) : null;
  }
  async writeSave(uid: string, d: CloudDoc): Promise<void> {
    await setDoc(doc(this.db, 'saves', uid), d);
  }

  // ---- phase 38 : classement en ligne (src/meta/board.ts), réservé aux joueurs connectés ----
  private scoreRef(uid: string, week: string | null) {
    return week ? doc(this.db, 'weeks', week, 'scores', uid) : doc(this.db, 'scores', uid);
  }
  /**
   * Publie une partie sous le pseudo `name` : fusion avec les meilleurs scores du joueur (tous les temps et semaine en
   * cours), écrite seulement si quelque chose change. `at` : fin de la partie (la semaine est celle de la partie).
   */
  async submitScore(uid: string, name: string, run: RunScore, at: number): Promise<void> {
    for (const week of [null, isoWeek(at)]) {
      const ref = this.scoreRef(uid, week);
      const snap = await getDoc(ref);
      const next = mergeScore(snap.exists() ? readScore(snap.data()) : null, run, name, Date.now());
      if (next) await setDoc(ref, next);
    }
  }
  /** Top BOARD.top d'une vue (tous les temps, ou la semaine `week`), et le document du joueur. */
  async fetchBoard(
    uid: string,
    view: BoardView,
    week: string | null,
  ): Promise<{ rows: BoardRow[]; mine: ScoreDoc | null }> {
    const col = week ? collection(this.db, 'weeks', week, 'scores') : collection(this.db, 'scores');
    const [list, me] = await Promise.all([
      getDocs(query(col, orderBy(view, 'desc'), limit(BOARD.top))),
      getDoc(this.scoreRef(uid, week)),
    ]);
    const rows: BoardRow[] = [];
    for (const d of list.docs) {
      const s = readScore(d.data());
      if (s) rows.push({ uid: d.id, name: s.name, char: s.char, value: s[view] });
    }
    return { rows, mine: me.exists() ? readScore(me.data()) : null };
  }
  /** Nouveau pseudo : appliqué aux documents existants seulement (aucun score n'est créé). */
  async renameScores(uid: string, name: string): Promise<void> {
    for (const week of [null, isoWeek(Date.now())]) {
      const ref = this.scoreRef(uid, week);
      const snap = await getDoc(ref);
      const prev = snap.exists() ? readScore(snap.data()) : null;
      if (prev && prev.name !== name) await setDoc(ref, { ...prev, name, at: Date.now() });
    }
  }
  /** Retire le joueur du classement (tous les temps et semaine en cours) : suppression du compte. */
  async deleteScores(uid: string): Promise<void> {
    await Promise.all([deleteDoc(this.scoreRef(uid, null)), deleteDoc(this.scoreRef(uid, isoWeek(Date.now())))]);
  }
}
