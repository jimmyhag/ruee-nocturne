/** Version de package.json, injectée au build par `define` dans vite.config.ts (une seule source de vérité). */
declare const __APP_VERSION__: string;

/** Phase 13 : configuration Firebase pour le dev local (.env.local) ; en production elle vient de /__/firebase/init.json. */
interface ImportMetaEnv {
  readonly VITE_FIREBASE_CONFIG?: string;
}

/** Nouveautés (1.49.0) : le journal des versions réduit pour les joueurs, produit au build par vite.config.ts. */
declare module 'virtual:patch-notes' {
  const notes: import('./meta/patch-notes').PatchNote[];
  export default notes;
}
