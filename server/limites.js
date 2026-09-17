import { config } from './config.js';
import { store } from './store.js';

// Limitation de débit par compte. Sans elle, un seul compte pouvait envoyer 1 333 messages par
// seconde, cinquante signalements en 65 ms et trente selfies en 28 ms : de quoi noyer la
// modération, harceler quelqu'un et rendre la base illisible.
//
// **Les compteurs vivent dans le stockage, pas dans ce fichier.** Ils étaient en mémoire, ce qui
// était correct tant qu'une seule machine tournait — mais le passage à PostgreSQL a levé cette
// contrainte sans que les compteurs suivent. À deux machines, chaque garde-fou valait le double
// dans les faits : 40 messages par minute au lieu de 20, 10 tentatives de vérification par heure
// au lieu de 5, puisque chaque machine tenait son propre compte sans voir celui de l'autre. Ce
// n'était pas un manque d'origine, c'était une incohérence introduite par le chantier précédent.
//
// Chaque stockage répond donc à sa mesure : le fichier JSON garde une carte en mémoire, parce
// qu'il est mono-instance par construction et qu'écrire le fichier entier à chaque message coûterait
// cher pour une exactitude dont ce mode n'a pas besoin ; PostgreSQL les met en base, dans une
// transaction, parce que c'est lui qui peut tourner à plusieurs.

// Chaque règle : combien d'actions au plus, sur quelle durée, et ce qu'on dit à la personne.
export const REGLES = {
  message: { max: 20, fenetreMs: 60_000, message: "Tu écris trop vite. Attends un instant avant d'envoyer le message suivant." },
  swipe: { max: 60, fenetreMs: 60_000, message: 'Tu vas trop vite. Reprends dans une minute.' },
  // « J'écris » par le flux : le client n'en envoie qu'un toutes les 2,5 s, la règle laisse de la marge
  frappe: { max: 40, fenetreMs: 60_000, message: 'Trop de signaux envoyés. Attends un instant.' },
  // Une facture Telegram par appui : dix par heure suffisent à quelqu'un qui hésite, et coupent
  // court à un script qui en fabriquerait mille.
  facture: { max: 10, fenetreMs: 3600_000, message: 'Trop de demandes de paiement. Réessaie dans une heure.' },
  verification: { max: 5, fenetreMs: 3_600_000, message: 'Trop de tentatives de vérification. Réessaie dans une heure.' },
  photo: { max: 12, fenetreMs: 3_600_000, message: 'Trop de photos envoyées. Réessaie dans une heure.' },
  // Les images envoyées dans une discussion : plus permissif que les photos de la fiche, qui sont
  // modérées une à une, mais borné — c'est le canal que l'anti-arnaque ne lit pas.
  image: { max: 30, fenetreMs: 3_600_000, message: "Trop d'images envoyées. Réessaie dans une heure." },
  voix: { max: 6, fenetreMs: 3_600_000, message: 'Trop de présentations vocales envoyées. Réessaie dans une heure.' },
  signalement: { max: 5, fenetreMs: 3_600_000, message: 'Trop de signalements en peu de temps. La modération a bien reçu les précédents.' },
  rendezvous: { max: 10, fenetreMs: 3_600_000, message: 'Trop de propositions de rendez-vous. Réessaie plus tard.' },
  // Confirmer une arrivée, c'est scanner un QR une fois par rendez-vous. Dix par heure laisse
  // largement la place aux mauvais scans, et ferme la porte à qui essaierait des codes en série.
  checkin: { max: 10, fenetreMs: 3_600_000, message: 'Trop de tentatives de confirmation. Réessaie dans une heure.' },
  profil: { max: 20, fenetreMs: 3_600_000, message: 'Trop de modifications du profil. Réessaie dans une heure.' },
  // Alerte de modération : ce n'est pas une limite imposée à la personne, c'est une digue qui
  // empêche un seul compte de noyer le groupe de modération sous ses propres blocages.
  alerteModeration: { max: 3, fenetreMs: 3_600_000, message: '' },
};

// Renvoie null si l'action est permise, sinon le nombre de secondes à attendre.
export async function consommer(userId, action, maintenant = Date.now()) {
  const regle = REGLES[action];
  if (!regle || !config.rateLimit) return null;
  return store.limiteConsommer(`${action}:${userId}`, regle.max, regle.fenetreMs, maintenant);
}

// Middleware Express. La réponse porte Retry-After, comme le veut la norme HTTP.
//
// Si le stockage ne répond pas, on laisse passer plutôt que de tout bloquer : un garde-fou
// anti-spam n'est pas une porte d'authentification, et une base injoignable fera de toute façon
// échouer la requête deux lignes plus loin. Le refus silencieux, lui, ne se verrait nulle part —
// d'où la trace.
export const limiter = (action) => async (req, res, next) => {
  let attente = null;
  try {
    attente = await consommer(req.user.id, action);
  } catch (e) {
    console.warn(`Limitation de débit indisponible (${action}) : ${e.message}`);
    return next();
  }
  if (attente === null) return next();
  res.set('Retry-After', String(attente));
  return res.status(429).json({ code: 'RATE_LIMIT', message: REGLES[action].message, retryAfter: attente });
};

// Pour les tests : repartir d'une ardoise propre.
export const reinitialiser = () => store.limitesReinitialiser();
