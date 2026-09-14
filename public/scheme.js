// Pose le schéma clair ou sombre avant le premier rendu des pages sans app (pages publiques,
// espace de modération). Un fichier plutôt qu'un script en ligne : la politique de sécurité de
// contenu n'autorise aucun script en ligne, pour qu'une injection ne puisse rien exécuter.
try {
  document.documentElement.dataset.scheme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
} catch { /* sans matchMedia, le schéma clair par défaut */ }
