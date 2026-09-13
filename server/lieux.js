// Le code d'un lieu partenaire : ce qu'il prouve, et ce qu'il ne prouve pas.
//
// **Ce qui n'allait pas.** Le code était écrit en clair dans `config.js` et se déduisait de
// l'identifiant du lieu : `rdv:lieu:palmier` pour le lieu `palmier`. Pire, l'objet lieu partait
// tel quel au navigateur à chaque interrogation de la discussion — le serveur *donnait* le code
// aux deux personnes du rendez-vous. Confirmer une arrivée depuis chez soi ne demandait donc
// aucune adresse, aucun déplacement, et pas même d'avoir vu le QR.
//
// **Ce qui change.** Le code n'est plus une donnée, c'est un calcul : une empreinte HMAC du
// secret serveur et de l'identifiant du lieu. Trois conséquences.
//   1. Il ne se devine pas : sans le secret, l'empreinte ne se reconstitue pas.
//   2. Il n'est plus dans Git, et plus dans aucun objet qu'une route pourrait recopier — les
//      lieux ne portent plus de champ `code` du tout. On ne peut pas laisser fuir ce qu'on ne
//      transporte pas ; c'est la seule protection qui ne dépend pas de la vigilance.
//   3. Il se renouvelle en changeant `VENUE_SECRET`, ce qui invalide d'un coup tous les QR
//      imprimés — la rotation d'urgence, si une feuille circule en photo.
//
// **Ce que ça ne règle pas, et qu'il faut dire.** Le code reste *fixe* pour un lieu donné. Il
// prouve « j'ai vu le QR de ce lieu », jamais « j'y suis en ce moment ». Qui l'a scanné une fois
// peut le réutiliser des mois plus tard depuis chez lui. Pour prouver la présence, il faut un
// code qui tourne, affiché par le lieu sur un écran — c'est le chantier P1-10, avec les lieux en
// base. Tant qu'il n'est pas fait, la métrique phare reste une borne haute, et **on ne peut pas
// facturer un lieu au rendez-vous confirmé** (P2-1).
import crypto from 'node:crypto';
import { config } from './config.js';

// Sans secret fourni, un secret tiré au hasard au démarrage. Ce défaut échoue du bon côté : les
// QR déjà imprimés cessent de marcher, aucun ne devient devinable. En production avec au moins
// un lieu partenaire, le serveur refuse de démarrer plutôt que d'invalider des feuilles à chaque
// déploiement (server/index.js).
export const secret = config.venueSecret || crypto.randomBytes(32).toString('hex');

// 16 caractères hexadécimaux, soit 64 bits : impossible à deviner, et le QR reste assez court
// pour se scanner du premier coup sur un téléphone d'entrée de gamme.
const LONGUEUR = 16;

// L'identifiant du lieu reste lisible dans le code : il dit de quel lieu vient une feuille
// retrouvée, ce qui sert à la réimprimer. Il n'aide personne — le secret est l'empreinte.
export const codeDuLieu = (venueId) => `rdv:${venueId}:${crypto
  .createHmac('sha256', secret).update(String(venueId)).digest('hex').slice(0, LONGUEUR)}`;

// Comparaison à temps constant. Les deux côtés sont d'abord hachés : `timingSafeEqual` jette une
// exception quand les longueurs diffèrent, et un code scanné peut avoir n'importe quelle
// longueur. Hacher rend les deux tampons égaux par construction, et retire au passage la fuite
// de longueur.
const empreinte = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest();
export const codeValide = (venueId, propose) => crypto.timingSafeEqual(empreinte(propose), empreinte(codeDuLieu(venueId)));
