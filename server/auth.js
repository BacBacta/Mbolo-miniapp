// Authentification : on ne fait JAMAIS confiance à initDataUnsafe côté navigateur.
// Le client envoie la chaîne brute Telegram.WebApp.initData ; le serveur vérifie sa signature
// avec le jeton du bot (procédure officielle « Validating data received via the Mini App »).
import crypto from 'node:crypto';
import { config, runtime } from './config.js';
import { store } from './store.js';

function hmac(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

function checkString(params, exclude) {
  return [...params.entries()]
    .filter(([k]) => !exclude.includes(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
}

export function validateInitData(initData, botToken, maxAgeSec = config.initDataMaxAgeSec) {
  if (!initData || !botToken) return { ok: false, reason: 'missing' };
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return { ok: false, reason: 'no_hash' };

  const secret = hmac('WebAppData', botToken);
  const expected = Buffer.from(hash, 'hex');
  // Selon les versions de Telegram, le champ « signature » est inclus ou non dans le calcul : on accepte les deux.
  const valid = [['hash'], ['hash', 'signature']].some((exclude) => {
    const computed = hmac(secret, checkString(params, exclude));
    return computed.length === expected.length && crypto.timingSafeEqual(computed, expected);
  });
  if (!valid) return { ok: false, reason: 'bad_signature' };

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return { ok: false, reason: 'expired' };

  let user = null;
  try {
    user = JSON.parse(params.get('user') || 'null');
  } catch {
    return { ok: false, reason: 'bad_user' };
  }
  if (!user?.id) return { ok: false, reason: 'no_user' };
  return { ok: true, user, startParam: params.get('start_param') || null };
}

// Un compte banni garde sa ligne en base — c'est ce qui permet de tenir la promesse « un compte
// fermé pour arnaque ne peut pas être recréé ». Il faut donc le refuser ici, à la seule porte par
// laquelle passe toute l'API, plutôt que dans chaque route.
function refuserSiBanni(req, res) {
  if (!req.user?.banned) return false;
  // Le nom du bot voyage avec le refus : l'écran du compte fermé en fait un bouton qui ouvre
  // la discussion du bot, au lieu de demander de taper une commande (audit 16, n° 13).
  res.status(403).json({
    code: 'BANNED',
    message: `Ton compte a été fermé par l'équipe de ${config.appName}. Si tu penses que c'est une erreur, écris au bot.`,
    bot: runtime.botUsername || undefined,
  });
  return true;
}

// Qui parle, sans créer de compte. requireAuth fait un upsert à chaque requête — c'est ce qui
// recréait une ligne juste après DELETE /api/me, quand l'app signalait sa fermeture
// (audit/09-revue-code.md, I3). Rend l'identifiant, ou null.
export function identiteSansCreer(req) {
  const header = req.get('authorization') || '';
  if (header.startsWith('tma ')) {
    const result = validateInitData(header.slice(4), config.botToken);
    return result.ok ? String(result.user.id) : null;
  }
  if (config.allowDevAuth && devUserValide(req.get('x-dev-user'))) return String(req.get('x-dev-user'));
  return null;
}

// L'identifiant de développement finit dans des noms de fichiers (« <id>-selfie.jpg ») : « ../x »
// écrirait hors du dossier. Inerte en production, borné quand même.
const devUserValide = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(id);

export async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  if (header.startsWith('tma ')) {
    const result = validateInitData(header.slice(4), config.botToken);
    if (!result.ok) return res.status(401).json({ code: 'UNAUTHORIZED', message: `Session Telegram invalide. Rouvre ${config.appName} depuis le bot.` });
    req.user = await store.upsertTelegramUser(result.user);
    return refuserSiBanni(req, res) ? undefined : next();
  }
  // Mode développement : tester l'interface dans un navigateur classique
  if (config.allowDevAuth && devUserValide(req.get('x-dev-user'))) {
    const id = req.get('x-dev-user');
    req.user = await store.upsertTelegramUser({ id, first_name: 'Testeur', language_code: 'fr' });
    // Rien ne distinguait un compte de test d'un vrai : après coup, ils sont indiscernables en
    // base, et l'équipe teste sur le même serveur que la bêta. Sans ce marqueur, aucun chiffre
    // n'est défendable. Il n'a aucun usage produit, et part avec le compte comme le reste.
    if (!req.user.devUser) req.user = await store.updateUser(id, { devUser: true });
    return refuserSiBanni(req, res) ? undefined : next();
  }
  return res.status(401).json({ code: 'UNAUTHORIZED', message: `Ouvre ${config.appName} depuis Telegram.` });
}
