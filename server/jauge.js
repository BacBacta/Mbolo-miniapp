// La jauge de confiance : ce qu'elle mesure, et ce qu'elle ne mesure pas encore.
//
// **Pourquoi ce fichier existe.** La jauge s'affichait « sur 3 » alors que le troisième critère,
// le garant, était figé à `false` pour tout compte réel — seuls les profils de démonstration
// l'avaient. Personne ne pouvait donc dépasser 2 sur 3, et rien ne disait pourquoi. Expliquer une
// jauge dans cet état (P1-5) aurait été expliquer une déception.
//
// La jauge compte donc **les critères ouverts**, et rien d'autre. Le garant, lui, ne reviendra pas :
// P1-6 est abandonné. Nommer un membre comme répondant d'un autre laisse croire à un recours —
// une personne arnaquée se retournerait vers lui — et cette responsabilité-là, on ne peut pas la
// tenir. Ajouter un critère reste une ligne dans cette liste le jour où un vrai mécanisme existe :
// le dénominateur suit tout seul, puisque la carte, l'écran d'explication et le score lisent tous
// cette même liste. Deux endroits qui décrivent la même chose finissent toujours par diverger ;
// ici il n'y en a qu'un.

import { config } from './config.js';

export const CRITERES = [
  {
    cle: 'selfie',
    titre: 'Selfie vérifié',
    quoi: "Un selfie avec un geste tiré au hasard, regardé par une personne de l'équipe.",
    comment: "C'est l'étape juste après ton profil.",
  },
  {
    cle: 'seniority',
    titre: 'Membre depuis 3 mois',
    quoi: "Le temps passé ici. Les comptes d'arnaque durent rarement aussi longtemps.",
    comment: 'Rien à faire : il vient tout seul.',
  },
];

const ANCIENNETE_MS = 90 * 24 * 3600 * 1000;

// Les profils de démonstration portent leur propre `trust` : on le lit s'il est là, on le calcule
// sinon. Un critère que la liste ne connaît pas (le garant, que les démos portent encore) est ignoré —
// il ne compte ni au numérateur ni au dénominateur.
export function calculer(user) {
  const pose = user?.profile?.trust;
  const acquis = (cle) => {
    if (pose && cle in pose) return !!pose[cle];
    if (cle === 'selfie') return user?.verification === 'approved';
    if (cle === 'seniority') return Date.now() - (Number(user?.createdAt) || Date.now()) > ANCIENNETE_MS;
    return false;
  };
  const criteres = CRITERES.map(({ cle, titre }) => ({ cle, titre, ok: acquis(cle) }));
  return { score: criteres.filter((c) => c.ok).length, total: criteres.length, criteres };
}

// **Ce que la carte montre** (audit 16, n° 19, décision du propriétaire). Le jour du lancement,
// tout membre réel affiche « 1 sur 2 » : le second critère, trois mois d'ancienneté, n'est
// atteignable par personne avant le lancement plus 90 jours. Une app où chacun est « à moitié »
// sûr ne rassure pas. Tant que ce jour n'est pas venu, la carte et la fiche ne montrent que le
// selfie — « Vérifié » seul — et la fraction ne vit que sur l'écran d'explication. Une date de
// lancement illisible ne fabrique pas de silence : la fraction s'affiche, comme avant.
export function fractionVisible(now = Date.now(), lancement = config.lancementLe) {
  const debut = Date.parse(lancement);
  if (!Number.isFinite(debut)) return true;
  return now - debut >= ANCIENNETE_MS;
}
export function jaugeCompleteLe(lancement = config.lancementLe) {
  const debut = Date.parse(lancement);
  return Number.isFinite(debut) ? new Date(debut + ANCIENNETE_MS).toISOString().slice(0, 10) : null;
}
