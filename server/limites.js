import { config } from './config.js';

// Limitation de débit par compte. Sans elle, un seul compte pouvait envoyer 1 333 messages par
// seconde, cinquante signalements en 65 ms et trente selfies en 28 ms : de quoi noyer la
// modération, harceler quelqu'un et rendre la base illisible.
//
// Fenêtre glissante en mémoire, sans dépendance. Deux conséquences assumées, documentées dans
// le README : les compteurs repartent à zéro au redémarrage, et ils ne sont pas partagés entre
// plusieurs instances. C'est suffisant tant que le stockage est un fichier JSON, donc mono-instance.

const compteurs = new Map();

// Chaque règle : combien d'actions au plus, sur quelle durée, et ce qu'on dit à la personne.
export const REGLES = {
  message: { max: 20, fenetreMs: 60_000, message: "Tu écris trop vite. Attends un instant avant d'envoyer le message suivant." },
  swipe: { max: 60, fenetreMs: 60_000, message: 'Tu vas trop vite. Reprends dans une minute.' },
  verification: { max: 5, fenetreMs: 3_600_000, message: 'Trop de tentatives de vérification. Réessaie dans une heure.' },
  photo: { max: 12, fenetreMs: 3_600_000, message: 'Trop de photos envoyées. Réessaie dans une heure.' },
  signalement: { max: 5, fenetreMs: 3_600_000, message: 'Trop de signalements en peu de temps. La modération a bien reçu les précédents.' },
  rendezvous: { max: 10, fenetreMs: 3_600_000, message: 'Trop de propositions de rendez-vous. Réessaie plus tard.' },
  profil: { max: 20, fenetreMs: 3_600_000, message: 'Trop de modifications du profil. Réessaie dans une heure.' },
  // Alerte de modération : ce n'est pas une limite imposée à la personne, c'est une digue qui
  // empêche un seul compte de noyer le groupe de modération sous ses propres blocages.
  alerteModeration: { max: 3, fenetreMs: 3_600_000, message: '' },
};

// Purge des fenêtres expirées : sans cela la carte grossirait indéfiniment.
function nettoyer(cle, fenetreMs, maintenant) {
  const horodatages = (compteurs.get(cle) || []).filter((t) => maintenant - t < fenetreMs);
  if (horodatages.length) compteurs.set(cle, horodatages);
  else compteurs.delete(cle);
  return horodatages;
}

// Renvoie null si l'action est permise, sinon le nombre de secondes à attendre.
export function consommer(userId, action, maintenant = Date.now()) {
  const regle = REGLES[action];
  if (!regle || !config.rateLimit) return null;
  const cle = `${action}:${userId}`;
  const horodatages = nettoyer(cle, regle.fenetreMs, maintenant);
  if (horodatages.length >= regle.max) {
    const attente = Math.ceil((regle.fenetreMs - (maintenant - horodatages[0])) / 1000);
    return Math.max(1, attente);
  }
  horodatages.push(maintenant);
  compteurs.set(cle, horodatages);
  return null;
}

// Middleware Express. La réponse porte Retry-After, comme le veut la norme HTTP.
export const limiter = (action) => (req, res, next) => {
  const attente = consommer(req.user.id, action);
  if (attente === null) return next();
  res.set('Retry-After', String(attente));
  return res.status(429).json({ code: 'RATE_LIMIT', message: REGLES[action].message, retryAfter: attente });
};

// Pour les tests : repartir d'une ardoise propre.
export const reinitialiser = () => compteurs.clear();
