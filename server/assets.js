// Version des fichiers envoyés au navigateur, pour que le cache ne serve jamais une ancienne version.
//
// La version vient du contenu, pas de l'heure de démarrage : tant que rien ne change, l'adresse
// reste la même et le cache est conservé. C'est important ici, car la machine s'arrête dès que
// personne ne s'en sert et repart à la requête suivante : une version tirée du démarrage ferait
// retélécharger l'app à chaque réveil, ce qui coûte de la data à des forfaits limités.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Les dictionnaires de langue entrent dans l'empreinte : une traduction corrigée doit atteindre
// les téléphones, comme une correction de code.
export const ASSET_FILES = ['app.js', 'tg.js', 'ui.js', 'i18n.js', 'styles.css'];
export const I18N_FILES = ['i18n/en.js'];

export function assetVersion(publicDir) {
  const h = crypto.createHash('sha1');
  for (const f of [...ASSET_FILES, ...I18N_FILES]) {
    const chemin = path.join(publicDir, f);
    if (fs.existsSync(chemin)) h.update(fs.readFileSync(chemin));
  }
  return h.digest('hex').slice(0, 10);
}

// index.html désigne app.js et styles.css, mais c'est app.js qui désigne tg.js et ui.js.
// Sans cette réécriture, ces deux modules garderaient une adresse fixe, donc l'ancien contenu.
export function versionImports(source, version) {
  return source.replace(/(from '\.\/(?:tg|ui|i18n)\.js)'/g, `$1?v=${version}'`);
}
