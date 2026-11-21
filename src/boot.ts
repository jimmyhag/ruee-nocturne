// Entrée de la page (docs/specs/demarrage-rapide.md, décision 2). Le script principal est téléchargé dès le début du
// chargement (`modulepreload`, posé par vite.config.ts) et évalué tout de suite, sauf au premier lancement : l'aide
// « Comment jouer », affichée par la page elle-même (index.html), passe d'abord à l'écran, puis main.ts la reprend.
// Son évaluation ne passe donc jamais avant le premier affichage d'un nouveau joueur ; « Jouer » touché d'ici là est
// noté par la page et rejoué par main.ts.

/** Délai (ms) au-delà duquel le script principal part sans attendre l'affichage (page ouverte en arrière-plan). */
const PAINT_WAIT_MS = 2000;

function start(): void {
  void import('./main');
}

const Observer = globalThis.PerformanceObserver;
if (!document.body.classList.contains('help-first') || !Observer?.supportedEntryTypes?.includes('paint')) start();
else {
  let done = false;
  const go = (): void => {
    if (done) return;
    done = true;
    seen.disconnect();
    clearTimeout(timer);
    start();
  };
  const seen = new Observer((list) => {
    if (list.getEntriesByName('first-contentful-paint').length) go();
  });
  seen.observe({ type: 'paint', buffered: true });
  const timer = setTimeout(go, PAINT_WAIT_MS);
}
