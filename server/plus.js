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
export const palier = (nom, user, maintenant = Date.now()) => PALIERS[nom][droitsOuverts(user, maintenant) ? 'avec' : 'sans'];

// Les sources possibles, reprises telles quelles de la table `entitlements` (section 10.4), pour
// que la migration soit une recopie et pas une traduction.
export const SOURCES = ['momo', 'stars', 'sponsor', 'gift'];

// ---------- Ce qui se vend : la grille ----------
//
// Trois durées, comme les forfaits data qu'on achète au jour, à la semaine ou au mois : c'est
// le geste que la cible connaît déjà, et un petit ticket au moment où l'on bute sur le mur vaut
// mieux qu'un grand ticket qu'on remet à plus tard. La grille vient de la configuration
// (PLUS_PRIX_STARS) ; elle est lue ici, une fois, et nulle part ailleurs — l'interface la reçoit
// par GET /api/me, le bot la lit pour la facture et la revérifie au moment de payer.
import { config } from './config.js';
import { AFRIQUE, COUNTRY_CODES } from './geo.js';

// ---------- Où le pass se vend, et où il est offert ----------
//
// Décision du propriétaire, 19 septembre 2026 : **pas de monétisation dans les pays d'Afrique
// pour l'instant.** Le pass n'y est pas vendu, et ce qu'il ouvre y est offert à tout le monde —
// à une exception, le quota de « J'aime » par jour, qui est d'abord un frein contre les faux
// comptes et garde ses marches (badge ou pas). Un cadenas sans caisse derrière n'apprend rien
// et frustre ; une porte ouverte se mesure au moins par l'usage.
//
// Le pays est celui **déclaré** sur le profil — ni le fuseau, qui n'est pas stocké, ni une
// géolocalisation, qu'on ne demande pas. C'est falsifiable : qui déclare Yaoundé depuis
// Bruxelles a le pass gratuit. Le sens du risque est bénin, et le README le dit.
//
// `PLUS_SANS_VENTE_PAYS` : des codes ISO séparés par des virgules, ou le mot « afrique » qui
// se déplie en 55 codes (server/geo.js). Une valeur illisible est ignorée en le disant. Vide :
// vendu partout, rien ne change.
function lireLesPaysSansVente(texte) {
  const pays = new Set();
  for (const morceau of String(texte || '').split(',')) {
    const mot = morceau.trim();
    if (!mot) continue;
    if (mot.toLowerCase() === 'afrique') { for (const c of AFRIQUE) pays.add(c); continue; }
    const code = mot.toUpperCase();
    if (!COUNTRY_CODES.includes(code)) { console.warn(`PLUS_SANS_VENTE_PAYS : « ${mot} » n'est ni un code de pays ni « afrique », ignoré.`); continue; }
    pays.add(code);
  }
  return pays;
}
export const PAYS_SANS_VENTE = lireLesPaysSansVente(config.plusSansVentePays);
const paysDe = (user) => String(user?.profile?.country || config.defaultCountry).toUpperCase();
// Le pass est-il proposé à cette personne ? Lu par la facture, par le pre_checkout, par
// GET /me (options.passEnVente) et par les chiffres.
export const passEnVente = (user) => !PAYS_SANS_VENTE.has(paysDe(user));
// Ce que le pass ouvre est-il ouvert à cette personne : parce qu'elle a un pass, ou parce
// qu'on ne lui en vend pas. C'est cette fonction que lisent les portes (liste, pays entier,
// langue, ordre, qui t'a aimé, vues, paliers) — et pas le quota, qui ne lit qu'estPlus().
export const droitsOuverts = (user, maintenant = Date.now()) => estPlus(user, maintenant) || !passEnVente(user);

function lireLaGrille(texte) {
  const offres = [];
  for (const morceau of String(texte || '').split(',')) {
    const m = /^\s*(\d+)\s*:\s*(\d+)\s*$/.exec(morceau);
    if (!m) { if (morceau.trim()) console.warn(`PLUS_PRIX_STARS : « ${morceau.trim()} » ignoré (forme attendue : jours:stars).`); continue; }
    const jours = Number(m[1]), stars = Number(m[2]);
    // Telegram borne une facture en Stars entre 1 et 10 000 ; une durée au-delà d'un an n'est plus un pass.
    if (jours < 1 || jours > 400 || stars < 1 || stars > 10000) { console.warn(`PLUS_PRIX_STARS : « ${morceau.trim()} » hors bornes, ignoré.`); continue; }
    if (offres.some((o) => o.jours === jours)) continue;
    offres.push({ jours, stars });
  }
  return offres.sort((a, b) => a.jours - b.jours);
}
export const OFFRES = lireLaGrille(config.plusPrixStars);
// L'offre mise en avant : celle du milieu, ou la seule. Un choix par défaut évite l'hésitation.
export const OFFRE_CONSEILLEE = OFFRES.length ? OFFRES[Math.floor((OFFRES.length - 1) / 2)].jours : null;
export const offre = (jours) => OFFRES.find((o) => o.jours === Number(jours)) || null;

// Les durées acceptées par la modération pour un pass offert : celles de la grille.
export const DUREES = OFFRES.map((o) => o.jours);

// La charge utile d'une facture : ce que Telegram nous rend intact au moment du paiement. Elle
// porte la durée et l'identifiant de qui a demandé la facture. La version en tête permet d'en
// changer la forme un jour sans confondre une vieille facture encore ouverte.
export const chargeUtile = (jours, userId) => `plus:1:${Number(jours)}:${String(userId)}`;
export function lireChargeUtile(texte) {
  const m = /^plus:1:(\d+):(\d+)$/.exec(String(texte || ''));
  return m ? { jours: Number(m[1]), userId: m[2] } : null;
}

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

// Retirer des jours après un remboursement : la fin recule d'autant, et un pass qui n'a plus de
// jours devant lui disparaît. Jamais en dessous de maintenant : on ne crée pas de dette.
// Fonction pure, comme prolonger().
export function retirer(user, jours, maintenant = Date.now()) {
  if (!estPlus(user, maintenant)) return null;
  const finLe = Number(user.plus.finLe) - Number(jours) * jourMs;
  return finLe > maintenant ? { ...user.plus, finLe } : null;
}
