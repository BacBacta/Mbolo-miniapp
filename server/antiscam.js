import { config } from './config.js';

// Filtre anti-arnaque. Deux erreurs coûtent cher, et pas de la même façon :
// un faux négatif laisse passer une arnaque, un faux positif tue une conversation ordinaire.
// Mesuré sur l'ancienne version : « ça me coûte 300 F pour venir », « j'ai plus de crédit » et
// « les frais de scolarité » étaient bloqués, tandis que « envoie juste 10k », « il faut
// 50 mille » et « achète-moi une carte de recharge » passaient.
//
// D'où la règle : un mot d'argent ne bloque jamais seul. Il faut un moyen de paiement nommé,
// ou une demande, c'est-à-dire un verbe de transfert ou un besoin, avec un montant ou un objet
// d'argent. Parler d'argent reste possible ; en demander, non.

const normalize = (t) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/0/g, 'o')
    .replace(/[.\-_*]/g, '');

// 1. Moyens de paiement et valeurs transférables : les nommer suffit, il n'y a pas d'usage innocent
// de « envoie sur mon Orange Money » dans une discussion de rencontre.
const MOYENS = [
  /\bmomo\b/,
  /mobile ?money/,
  /orange ?money/,
  /\bom\b/,
  /\bwestern ?union\b/,
  /\b(usdt|bitcoin|crypto|paypal)\b/,
  /\bvisa\b/,
  /\bcode (secret|pin)\b/,
  /\brib\b/,
  /\biban\b/,
];

// 2. Verbes de transfert d'argent.
const VERBE_TRANSFERT = /\b(envoi?e|envoie?s|envoyer|donne|donner|transfer(e|er|t)?|verse|verser|paie|payer|paye|regle|regler|achete|acheter|recharge|recharger|rembourse|rembourser|avance|avancer)\b/;

// 3. Verbes de dépannage : demander à être dépanné est une demande d'argent, en avoir été dépanné
// par quelqu'un d'autre n'en est pas une. D'où l'exigence d'une cible « moi ».
const VERBE_DEPANNAGE = /\b(depann(e|er)|pret(e|er|es)|emprunt(e|er))\b/;
// « m » seul est exclu : dans « il m'a dépanné », la limite de mot tombe avant l'apostrophe,
// et la phrase raconte un fait passé au lieu de demander quoi que ce soit.
const CIBLE_MOI = /\b(moi|mw|me)\b/;

// 4. Expression d'un besoin.
const BESOIN = /\b(besoin|manque|faut|aide ?(moi|mw|me)|aidez ?moi|help ?(me|mi)?|helep)\b/;

// 5. Montants, y compris l'argot local : 10k, 50 mille, deux cent mille.
const MONTANT = /\b\d+ ?(k|mille|millions?|f|fcfa|francs?|cfa|euros?|€|\$)\b|\d+ ?(f|fcfa|€|\$)\b|\b\d{4,}\b/;

// 6. Objets qui valent de l'argent au Cameroun. Seuls, ils ne bloquent rien.
const OBJET_ARGENT = /\b(argent|sous|cash|monnaie|unites?|credit|recharge|frais|caution|douane|taxe|amende|facture|somme|billet|virement|carte)\b/;

const CONTACT = [
  /(\+?237)?\s?6\s?\d(\s?\d){7}/, // numéro camerounais
  /https?:\/\//,
  /\bwww\./,
  /\bt\.me\//,
  /\bwa\.me\//,
  /@[a-z0-9_]{5,}/i, // pseudo Telegram
  /\b(whatsapp|whats app|snap|instagram|insta)\b/,
];

const teste = (regles, ...textes) => (Array.isArray(regles) ? regles : [regles]).some((r) => textes.some((t) => r.test(t)));

// Renvoie la catégorie de blocage, ou null. Exportée pour les tests et la modération.
export function categorieArgent(text) {
  const n = normalize(text);
  const brut = text.toLowerCase();
  if (teste(MOYENS, n, brut)) return 'moyen de paiement';
  const montantOuObjet = teste(MONTANT, n, brut) || teste(OBJET_ARGENT, n, brut);
  if (teste(VERBE_TRANSFERT, n, brut) && montantOuObjet) return 'demande de transfert';
  if (teste(BESOIN, n, brut) && montantOuObjet) return "besoin d'argent";
  if (teste(VERBE_DEPANNAGE, n, brut) && (teste(CIBLE_MOI, n, brut) || montantOuObjet)) return 'demande de dépannage';
  return null;
}

export function checkMessage(text, messageCountInMatch, unlockAfter) {
  const categorie = categorieArgent(text);
  if (categorie) {
    return {
      ok: false,
      code: 'MONEY_BLOCKED',
      categorie,
      // Dire ce qui a déclenché le blocage : sans cela, la personne ne sait pas quoi corriger.
      message: `Les demandes et offres d'argent sont bloquées sur ${config.appName}. Ce message ressemble à une ${categorie}. Retire le montant ou le moyen de paiement, et renvoie-le.`,
    };
  }
  const n = normalize(text);
  const brut = text.toLowerCase();
  if (messageCountInMatch < unlockAfter && teste(CONTACT, brut, n)) {
    return {
      ok: false,
      code: 'CONTACT_TOO_EARLY',
      categorie: 'contact',
      message: `Les liens, numéros et pseudos sont débloqués après ${unlockAfter} messages échangés de chaque côté.`,
    };
  }
  return { ok: true };
}
