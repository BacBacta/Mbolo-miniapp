// La présentation vocale : quinze secondes, enregistrées dans Telegram.
//
// **Pourquoi dans Telegram et pas dans la mini app.** `getUserMedia` est inutilisable dans les
// mini apps sur Android : la caméra ne s'ouvre pas, et la demande de permission se répète ou
// n'apparaît jamais. Android d'entrée de gamme est précisément notre cible. L'app délègue déjà la
// prise du selfie au module natif (`capture="user"`) pour cette raison ; le message vocal de
// Telegram est le même choix, poussé au bout : c'est l'enregistreur que la personne a déjà, qu'elle
// sait utiliser, et qui marche sur tous les téléphones où l'app tourne.
//
// Ce que ce choix évite en plus : **aucun transcodage**. Telegram livre de l'opus déjà compressé
// (une quinzaine de kilo-octets) avec sa durée. Un fichier venu d'un enregistreur Android
// quelconque serait arrivé en AMR ou en WAV, et aurait demandé ffmpeg sur une machine de 256 Mo.
//
// **Ce que ça ouvre, et qu'il faut regarder en face** : la voix échappe entièrement à
// `antiscam.js`, qui ne lit que du texte. Rien n'empêche quelqu'un de dire son numéro à haute
// voix. La seule barrière est donc humaine — chaque présentation est écoutée par la modération
// avant que quiconque l'entende, exactement comme une photo est regardée avant d'être montrée.
// C'est pour cela qu'elle ne vit que sur le profil, jamais dans une discussion : un canal
// modéré et public, pas un canal privé.

export const DUREE_MAX_S = 15;
// En dessous, il n'y a rien à dire : c'est un appui malheureux, pas une présentation.
export const DUREE_MIN_S = 2;

export const fichierVoix = (userId) => `${userId}-voix.ogg`;

// Dit si un message vocal peut être accepté, et sinon pourquoi — la phrase part telle quelle à la
// personne, en français, avec ses variables. Renvoie null quand tout va bien.
export function refusDuree(secondes) {
  if (!Number.isFinite(secondes) || secondes <= 0) return { cle: "Ce message n'a pas de durée lisible. Réessaie.", vars: {} };
  if (secondes > DUREE_MAX_S) {
    return { cle: 'Ta présentation dure {n} secondes, le maximum est {max}. Réenregistre plus court.', vars: { n: Math.round(secondes), max: DUREE_MAX_S } };
  }
  if (secondes < DUREE_MIN_S) return { cle: "C'est trop court pour dire quoi que ce soit. Réenregistre.", vars: {} };
  return null;
}

// Ce que les autres ont le droit de savoir : qu'une présentation existe, rien de plus.
// Le statut et la date ne sortent que pour la personne elle-même.
export const voixPublique = (user) => (user?.voix?.status === 'approved' ? true : false);
