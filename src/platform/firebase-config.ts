// Configuration web de Firebase (lot L1 : sortie de account.ts). Sans import de `firebase` : la mesure de fréquentation
// (src/platform/retention.ts) la lit sans charger le SDK, le compte (account.ts, chargé à la demande) aussi.
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
