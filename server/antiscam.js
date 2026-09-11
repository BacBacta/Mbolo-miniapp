import { config } from './config.js';

// Règles simples, à enrichir avec les vrais messages signalés pendant la bêta.
// On normalise le texte pour contrer les contournements courants (M.o.M.o, m0m0, espaces).

const normalize = (t) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/0/g, 'o')
    .replace(/[.\-_*]/g, '');

const MONEY = [
  /\bmomo\b/,
  /mobile ?money/,
  /orange ?money/,
  /\bom\b/,
  /\btransf[e]?r/,
  /envoie ?(moi|mw|me)/,
  /\bvisa\b/,
  /\bcredit\b/,
  /\bfrais\b/,
  /\bwestern ?union\b/,
  /\bpret(e|er)?\b/,
  /\bdepann/,
  /\bcode (secret|pin)\b/,
  /\d+ ?(f|fcfa|francs|cfa|euros?|€|\$)\b/,
  /\b(usdt|bitcoin|crypto)\b/,
];

const CONTACT = [
  /(\+?237)?\s?6\s?\d(\s?\d){7}/, // numéro camerounais
  /https?:\/\//,
  /\bwww\./,
  /\bt\.me\//,
  /\bwa\.me\//,
  /@[a-z0-9_]{5,}/i, // pseudo Telegram
  /\b(whatsapp|whats app|snap|instagram|insta)\b/,
];

export function checkMessage(text, messageCountInMatch, unlockAfter) {
  const n = normalize(text);
  const raw = text.toLowerCase();
  if (MONEY.some((r) => r.test(n) || r.test(raw))) {
    return { ok: false, code: 'MONEY_BLOCKED', message: `Les demandes et offres d'argent sont bloquées sur ${config.appName}.` };
  }
  if (messageCountInMatch < unlockAfter && CONTACT.some((r) => r.test(raw) || r.test(n))) {
    return {
      ok: false,
      code: 'CONTACT_TOO_EARLY',
      message: `Les liens, numéros et pseudos sont débloqués après ${unlockAfter} messages échangés.`,
    };
  }
  return { ok: true };
}
