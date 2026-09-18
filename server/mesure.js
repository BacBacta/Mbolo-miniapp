// Poser les événements de mesure, et ne pas en poser trop.
//
// Le dictionnaire complet est dans audit/05-mesure-produit.md. Ce module n'invente rien : il
// applique trois règles que le plan pose et qu'il serait facile d'enfreindre sans le vouloir.
//
// 1. Aucun texte. Les charges utiles sont vérifiées ici plutôt que sur parole : un appelant qui
//    passerait un message ou un prénom se ferait refuser, et ça se verrait dans le journal.
// 2. Certains événements sont ralentis. app_opened une fois par heure, deck_served une fois par
//    cinq minutes : sans ça, la discussion qui interroge toutes les 4 s écrirait des centaines de
//    lignes par heure et par personne, pour une information nulle.
// 3. Rien n'est jamais attendu. Une mesure qui ralentit une requête, ou pire qui la fait échouer,
//    coûte plus cher que ce qu'elle rapporte. Les appels partent sans await et n'explosent jamais.
import { config } from './config.js';
import { store } from './store.js';

// Les clés posées par le code, pour que la liste se lise à un endroit plutôt que de se
// reconstituer en fouillant les appels. Elle ne sert à rien au calcul — `mesurer()` n'y regarde
// pas — mais elle dit ce que `server/chiffres.js` a le droit d'attendre de trouver.
//
//   app_opened {}        · une par heure et par personne : ce qui permet de dater un départ
//   venu_de {source}     · **une par compte, à vie** : par quel canal la personne est arrivée.
//                          Un canal, jamais un parrain — voir SOURCES dans config.js
//   form_step {step}     · l'étape maximale atteinte dans le formulaire, jointe à l'ouverture suivante
//   profile_saved {}     · selfie_sent {} · verif_decided {ok, auto, ms} · verif_retried {}
//   deck_served {n, r}   · une par paquet, ralentie à cinq minutes ; `r` absent avec un pass
//   deck_empty {why}     · quota_hit {action, q} — `q` est le palier touché, absent avant le 15/09/2026
//   antiscam_block {code}· le code de la règle, jamais le libellé ni le texte
//   account_deleted {}   · sans identifiant
//   pass_pose {jours}    · pass_retire {} — ce que la modération distribue à la main
//   pass_refuse {quoi}   · **la demande** : qui bute sur le mur sans pass. Sans caisse, c'est la
//                          seule façon de savoir si ce qu'il y a derrière intéresse quelqu'un
//   pass_usage {quoi}    · l'usage réel, ralenti : un pass dont personne ne se sert ne vaut rien
//   pass_vu {quoi}       · l'écran du pass ouvert, ralenti à 5 min, avec la porte d'où l'on vient :
//                          c'est le dénominateur de la conversion
//   pass_facture {jours,stars} · une facture demandée (le bouton appuyé) ; pass_achat {jours,stars}
//                          · un paiement reçu de Telegram ; pass_rembourse {jours} · un remboursement
//   arrivee_dite {n}     · une ligne **par arrivée**, pas par destinataire : à combien de personnes
//                          la nouvelle a été utile. Ce qu'elle ne dit pas : si elles sont revenues
//   amorce {k}           · un **premier message** dans un fil, parti d'une amorce proposée en haut de
//                          la discussion vide. Jamais avec un profil de démonstration — voir routes.js
//   like_sur {q}         · un « J'aime » qui vise une réponse de la fiche : la **clé** de la question
//                          (liste fermée de config.js), jamais le mot qui l'accompagne

// Les seules formes admises dans une charge utile. Tout le reste est un refus : c'est la barrière
// qui empêche un texte libre d'entrer un jour par inadvertance.
// `Number.isFinite` et pas `typeof number` : Infinity et NaN sont des nombres pour JavaScript, mais
// JSON ne sait pas les écrire — ils ressortiraient en `null`, et une charge que le stockage ne sait
// pas écrire est exactement ce que cette barrière doit arrêter. Un quota sans limite se dit en
// omettant la clé, pas en envoyant l'infini.
const VALEUR_OK = (v) => Number.isFinite(v) || typeof v === 'boolean' || (typeof v === 'string' && v.length <= 24 && /^[\w.:-]+$/.test(v));

export function chargeValide(p) {
  if (p === undefined || p === null) return true;
  if (typeof p !== 'object' || Array.isArray(p)) return false;
  return Object.entries(p).every(([k, v]) => /^[a-z]{1,12}$/.test(k) && VALEUR_OK(v));
}

// Écrit, ou refuse en le disant. Ne jette jamais : une mesure ne casse pas une requête.
export async function mesurer(k, u, p) {
  try {
    if (!chargeValide(p)) {
      console.warn(`Événement « ${k} » refusé : sa charge utile n'est pas faite de nombres et de mots-clés fermés.`);
      return null;
    }
    return await store.addEvent(k, u, p);
  } catch (e) {
    console.warn(`Événement « ${k} » non enregistré : ${e.message}`);
    return null;
  }
}

// Les événements de fréquence. Le dernier passage est retenu sur la personne — comme lastNotifiedAt
// pour les notifications — plutôt qu'en mémoire : deux instances compteraient chacune de leur côté.
// `cle` est le nom du ralenti, par défaut celui de l'événement. Les événements du pass le
// prennent par porte (« pass_refuse:likes », « pass_refuse:vues ») : sans ça, buter sur deux
// portes dans les cinq minutes ne comptait que la première, et « chaque porte se compte à part »
// devenait faux dès qu'on ouvrait Messages puis Profil.
export async function mesurerRalenti(k, user, ms, p, cle = k) {
  if (!config.eventsRetentionDays || !user) return null;
  const dernier = user.lastEventAt?.[cle] || 0;
  if (Date.now() - dernier < ms) return null;
  await store.updateUser(user.id, { lastEventAt: { ...user.lastEventAt, [cle]: Date.now() } });
  return mesurer(k, user.id, p);
}

export const HEURE = 3600 * 1000;
export const CINQ_MINUTES = 5 * 60 * 1000;

// La semaine ISO d'inscription, pour account_deleted : elle situe une cohorte sans désigner
// personne, là où une date exacte de création rendrait un compte reconnaissable.
export function semaineIso(ms) {
  const d = new Date(ms);
  const jeudi = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  jeudi.setUTCDate(jeudi.getUTCDate() + 3 - ((jeudi.getUTCDay() + 6) % 7));
  const premier = new Date(Date.UTC(jeudi.getUTCFullYear(), 0, 4));
  const n = 1 + Math.round(((jeudi - premier) / 86400000 - 3 + ((premier.getUTCDay() + 6) % 7)) / 7);
  return `${jeudi.getUTCFullYear()}-W${String(n).padStart(2, '0')}`;
}
