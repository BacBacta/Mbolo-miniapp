// « Quelqu'un vient d'arriver et correspond à ce que tu cherches » : qui l'apprend, et qui non.
//
// **Pourquoi à l'arrivée, et pas par balayage.** Un balayage toutes les six heures aurait relu
// toute la table pour, la plupart du temps, ne rien trouver — sur une machine de 256 Mo, et alors
// que `allUsers()` est déjà la dette technique n° 3. Ici on ne travaille qu'au moment où quelqu'un
// devient visible : un événement rare, et le seul moment où la nouvelle est vraie. Ça règle aussi
// le pluriel sans y penser — on annonce **une** personne, donc la phrase est au singulier, et
// `server/i18n.js` n'a pas besoin des quatre formes du russe.
//
// **Ce que cette notification ne dit pas.** Ni prénom, ni photo, ni rien qui nomme l'arrivant :
// juste qu'il existe et qu'il est dans ton paquet. C'est la même règle que « qui t'a aimé » — la
// notification ne doit rien apprendre qu'ouvrir l'app n'apprendrait. Ici elle est honnête par
// construction : l'arrivant **est** dans la découverte de qui reçoit, avec sa ville sur sa carte
// et son badge « Nouveau » pendant une semaine. On ne dévoile rien, on dit d'ouvrir.
//
// **Le risque à ne pas perdre de vue.** Réveiller des comptes endormis à chaque inscription est
// le réflexe qui fait désinstaller une app de rencontres. Trois freins, donc : on ne prévient
// personne qui vient d'ouvrir l'app (il l'a déjà vu), au plus une fois toutes les 48 h par
// personne, et jamais plus de vingt personnes pour une arrivée.

// Qui vient d'ouvrir l'app n'a pas besoin d'être prévenu : la carte va apparaître dans son paquet
// au prochain rafraîchissement, et un message pour ça ferait double emploi.
export const ACTIF_RECENT_MS = 30 * 60 * 1000;
// Au plus une annonce toutes les 48 h par personne. Deux jours, parce qu'une arrivée par jour
// dans une petite ville ferait un message par jour — et un message par jour se coupe.
export const RALENTI_MS = 48 * 3600 * 1000;
// Le plafond par arrivée. Il protège deux choses : la limite de débit de Telegram (une trentaine
// de messages par seconde), et l'idée qu'une notification se mérite — si cent personnes
// correspondent, en prévenir cent d'un coup est un envoi de masse, pas une nouvelle.
export const MAX_PREVENUS = 20;

// Qui prévenir de l'arrivée de `arrivant`.
//
// Fonction **pure** : elle ne lit ni le stockage ni l'horloge, et ne décide rien de l'envoi. Tout
// ce qui dépend de l'app — « cette personne verrait-elle celle-là dans son paquet » — entre par
// `peutVoir`, pour que la règle se lise ici sans traîner `routes.js` derrière elle.
export function quiPrevenir({
  arrivant,
  tous,
  peutVoir,
  maintenant = Date.now(),
  actifRecentMs = ACTIF_RECENT_MS,
  ralentiMs = RALENTI_MS,
  max = MAX_PREVENUS,
}) {
  if (!arrivant?.profile) return [];
  const retenus = (tous || []).filter((u) => {
    if (!u || String(u.id) === String(arrivant.id)) return false;
    // Un profil de démonstration n'a personne derrière, un compte fermé n'a plus rien à voir,
    // et quelqu'un sans profil n'a pas encore dit ce qu'il cherche.
    if (u.demo || u.banned || !u.profile) return false;
    // Il vient d'ouvrir : la carte arrive dans son paquet toute seule.
    if (maintenant - (Number(u.lastActiveAt) || 0) < actifRecentMs) return false;
    // Déjà prévenu récemment. `notify()` revérifie ce même ralentisseur au moment d'envoyer —
    // le double contrôle est voulu : ici il empêche de gâcher des places sous le plafond, là-bas
    // il tient si deux arrivées se croisent.
    if (maintenant - (Number(u.lastNotifiedAt?.nouveaux) || 0) < ralentiMs) return false;
    return peutVoir(u, arrivant);
  });
  // Les plus récemment actifs d'abord. C'est le choix le moins agressif : on parle à des gens qui
  // reviennent déjà, plutôt que de réveiller les comptes les plus endormis — exactement ce qu'on
  // ne veut pas faire. Le tri ne sert qu'à décider qui entre sous le plafond.
  return retenus
    .sort((a, b) => (Number(b.lastActiveAt) || 0) - (Number(a.lastActiveAt) || 0))
    .slice(0, max);
}
