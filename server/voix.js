// La présentation vocale : quinze secondes, enregistrées dans Telegram.
//
// **Pourquoi dans Telegram et pas dans la mini app.** `getUserMedia` est inutilisable dans les
// mini apps sur Android : la caméra ne s'ouvre pas, et la demande de permission se répète ou
// n'apparaît jamais. Android d'entrée de gamme est précisément notre cible. Le selfie a rencontré
// le même mur par un autre chemin — Telegram Android ignore `capture`, la galerie s'ouvre quoi
// qu'on écrive, et l'app a cessé de promettre une caméra. Le message vocal de Telegram est ce
// constat poussé au bout : c'est l'enregistreur que la personne a déjà, qu'elle sait utiliser, et
// qui marche sur tous les téléphones où l'app tourne.
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

// La durée maximale **sans pass**. Elle n'est plus la seule : un pass la porte à trente secondes
// (`PALIERS.voixSecondes` dans `server/plus.js`, le seul endroit qui dit ce que le pass ouvre).
// Elle reste exportée parce qu'elle est le défaut, et parce qu'un appelant qui ne sait pas de qui
// il parle doit tomber sur la borne la plus stricte, jamais sur la plus large.
export const DUREE_MAX_S = 15;
// En dessous, il n'y a rien à dire : c'est un appui malheureux, pas une présentation.
export const DUREE_MIN_S = 2;

export const fichierVoix = (userId) => `${userId}-voix.ogg`;

// Dit si un message vocal peut être accepté, et sinon pourquoi — la phrase part telle quelle à la
// personne, en français, avec ses variables. Renvoie null quand tout va bien.
export function refusDuree(secondes, max = DUREE_MAX_S) {
  if (!Number.isFinite(secondes) || secondes <= 0) return { cle: "Ce message n'a pas de durée lisible. Réessaie.", vars: {} };
  if (secondes > max) {
    return { cle: 'Ta présentation dure {n} secondes, le maximum est {max}. Réenregistre plus court.', vars: { n: Math.round(secondes), max } };
  }
  if (secondes < DUREE_MIN_S) return { cle: "C'est trop court pour dire quoi que ce soit. Réenregistre.", vars: {} };
  return null;
}

// Ce que les autres ont le droit de savoir : qu'une présentation validée existe, et sa durée.
// La durée n'est pas un détail d'affichage : elle dit à l'avance ce que l'écoute va coûter en
// data, sur des forfaits comptés. Le statut et la date, eux, ne sortent que pour la personne.
export const voixPublique = (user) => (user?.voix?.status === 'approved' ? { duree: user.voix.duree || 0 } : null);
