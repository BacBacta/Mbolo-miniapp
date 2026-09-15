// Odo Plus : le seul endroit qui dit qui a le pass, et jusqu'à quand.
//
// **Pourquoi une fonction, et pourquoi celle-ci seulement.** Le cahier des charges (section 10.4)
// range les droits dans une table `entitlements`, avec les paiements. Cette table arrivera avec la
// caisse (P0-6) ; le pass, lui, est utile avant : un pass **offert à la main** depuis le groupe de
// modération suffit à savoir si ce qu'on met derrière change quelque chose pour de vrais membres.
// D'ici là le droit vit dans l'objet utilisateur (`u.plus`), qui est du jsonb sur PostgreSQL comme
// dans le fichier : aucune migration, aucune table à défaire ensuite. Ce qui compte est que **rien
// dans le code ne lise le champ** : tout passe par `estPlus()`, exactement comme `entreeLibre()` et
// `genreAuChoix()`. Le jour où la table existe, cette fonction devient sa projection et c'est la
// seule ligne à réécrire — sinon la règle serait recopiée dans quinze fichiers, et le quinzième
// resterait en arrière.
//
// **Ce que le pass n'est pas.** Pas un abonnement : aucune reconduction tacite, aucune empreinte
// de moyen de paiement gardée pour la suite. Un pass a une fin franche, et il faut un geste pour
// en reprendre un (section 10.2). C'est plus cher en réachat, et c'est le prix de la promesse.

// ---------- Ce que le pass ouvre, chiffre par chiffre ----------
//
// Une table plutôt que des constantes éparpillées, pour la même raison que `CRITERES` dans
// `jauge.js` : la carte, l'interface et le serveur lisent tous la même ligne, et deux endroits qui
// décrivent la même chose finissent toujours par diverger. L'interface ne recopie aucun de ces
// nombres — `GET /api/me` les lui envoie.
//
// Ce qui n'est **pas** ici, et n'y sera pas : les limites de débit (des digues anti-abus), le
// déverrouillage des contacts avant dix messages (une barrière anti-arnaque), et l'activité
// précise d'un autre membre (elle est arrondie exprès). Vendre l'un de ces trois-là reviendrait à
// vendre la capacité de nuire, ou la vie privée de quelqu'un d'autre.
export const PALIERS = {
  photos: { sans: 2, avec: 6 },
  voixSecondes: { sans: 15, avec: 30 },
  // Questions sur la fiche : la première est obligatoire pour tout le monde, les deux suivantes
  // viennent avec le pass. Comme les photos, la borne s'applique à l'ajout, jamais à l'affichage.
  questions: { sans: 1, avec: 3 },
};

// Ce que le pass ouvre sans nombre : des droits, pas des paliers. Lus par `GET /api/me` pour que
// l'interface montre un cadenas au bon endroit sans recopier la règle.
export const DROITS_DU_PASS = ['liste', 'paysEntier', 'filtreLangue', 'ordreDuPaquet'];

// Les ordres du paquet qu'on peut choisir avec un pass. Une liste fermée : une valeur inventée
// est refusée, jamais rangée (règle 5.1). Chacun ne trie que sur ce que la carte montre déjà —
// l'activité **par tranche** et pas à l'heure près, le badge « Nouveau », le quartier — pour
// que choisir un ordre n'apprenne rien qu'on ne verrait pas en regardant les cartes une à une.
// Et dans tous, qui t'a aimé passe devant : c'est le meilleur signal qui existe, on ne le cache
// pas derrière un réglage.
export const ORDRES = ['defaut', 'actifs', 'nouveaux', 'proches'];
export const ORDRE_DEFAUT = 'defaut';

// Le palier qui s'applique à cette personne. `estPlus()` reste le seul endroit qui tranche : cette
// fonction ne fait que lire la table à la lumière de sa réponse.
export const palier = (nom, user, maintenant = Date.now()) => PALIERS[nom][estPlus(user, maintenant) ? 'avec' : 'sans'];

// Les sources possibles, reprises telles quelles de la table `entitlements` (section 10.4), pour
// que la migration soit une recopie et pas une traduction.
export const SOURCES = ['momo', 'stars', 'sponsor', 'gift'];

// Les durées vendues. Deux, pas cinq : un pass qu'on ne sait pas choisir ne se vend pas.
export const DUREES = [30, 90];

const jourMs = 24 * 3600 * 1000;

// Le seul endroit qui tranche. Un pass sans fin lisible n'existe pas : une date absente, nulle ou
// illisible vaut « pas de pass », jamais « pass éternel » — se tromper dans ce sens-là donnerait
// le pass à tout le monde le jour d'une écriture ratée.
export function estPlus(user, maintenant = Date.now()) {
  const fin = Number(user?.plus?.finLe);
  return Number.isFinite(fin) && fin > maintenant;
}

// Ce que l'app et le bot ont le droit de savoir : actif ou non, jusqu'à quand, d'où il vient.
// Jamais l'historique, jamais le moyen de paiement.
export function etatDuPass(user, maintenant = Date.now()) {
  const actif = estPlus(user, maintenant);
  return {
    actif,
    finLe: actif ? Number(user.plus.finLe) : null,
    source: actif ? user.plus.source : null,
    jours: actif ? Math.ceil((Number(user.plus.finLe) - maintenant) / jourMs) : 0,
  };
}

// Poser un pass. **Il s'empile** : un pass pris pendant qu'un autre court repousse la fin, il ne
// la remplace pas (section 10.7, « prolongation, jamais de perte »). Payer deux fois et ne recevoir
// qu'une fois est la faute qu'on ne rattrape pas — la personne a vu l'argent partir.
// Fonction pure : elle rend le champ, c'est l'appelant qui l'écrit.
export function prolonger(user, { jours, source = 'gift' }, maintenant = Date.now()) {
  const n = Number(jours);
  if (!Number.isInteger(n) || n <= 0 || n > 400) throw new Error('Durée de pass invalide.');
  if (!SOURCES.includes(source)) throw new Error('Source de pass inconnue.');
  const depart = estPlus(user, maintenant) ? Number(user.plus.finLe) : maintenant;
  return { source, depuisLe: user?.plus?.depuisLe || maintenant, finLe: depart + n * jourMs };
}
