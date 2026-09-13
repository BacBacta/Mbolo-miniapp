// La jauge de confiance : ce qu'elle mesure, et ce qu'elle ne mesure pas encore.
//
// **Pourquoi ce fichier existe.** La jauge s'affichait « sur 3 » alors que le troisième critère,
// le garant, était figé à `false` pour tout compte réel — seuls les profils de démonstration
// l'avaient. Personne ne pouvait donc dépasser 2 sur 3, et rien ne disait pourquoi. Expliquer une
// jauge dans cet état (P1-5) aurait été expliquer une déception.
//
// La jauge compte donc **les critères ouverts**, et rien d'autre. Le garant rejoindra la liste le
// jour où P1-6 lui donnera un mécanisme : une ligne à ajouter ici, et le dénominateur suit tout
// seul — la carte, l'écran d'explication et le score lisent tous cette même liste. Deux endroits
// qui décrivent la même chose finissent toujours par diverger ; ici il n'y en a qu'un.

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
// sinon. Un critère que la liste ne connaît pas (le garant, aujourd'hui) est simplement ignoré —
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
