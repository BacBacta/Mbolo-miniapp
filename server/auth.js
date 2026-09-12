// Authentification : on ne fait JAMAIS confiance à initDataUnsafe côté navigateur.
// Le client envoie la chaîne brute Telegram.WebApp.initData ; le serveur vérifie sa signature
// avec le jeton du bot (procédure officielle « Validating data received via the Mini App »).
import crypto from 'node:crypto';
import { config } from './config.js';
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
  res.status(403).json({
    code: 'BANNED',
    message: `Ton compte a été fermé par l'équipe de ${config.appName}. Si tu penses que c'est une erreur, écris au bot avec la commande /aide.`,
  });
  return true;
}

export async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  if (header.startsWith('tma ')) {
    const result = validateInitData(header.slice(4), config.botToken);
    if (!result.ok) return res.status(401).json({ code: 'UNAUTHORIZED', message: `Session Telegram invalide. Rouvre ${config.appName} depuis le bot.` });
    req.user = await store.upsertTelegramUser(result.user);
    return refuserSiBanni(req, res) ? undefined : next();
  }
  // Mode développement : tester l'interface dans un navigateur classique
  if (config.allowDevAuth && req.get('x-dev-user')) {
    const id = req.get('x-dev-user');
    req.user = await store.upsertTelegramUser({ id, first_name: 'Testeur', language_code: 'fr' });
    return refuserSiBanni(req, res) ? undefined : next();
  }
  return res.status(401).json({ code: 'UNAUTHORIZED', message: `Ouvre ${config.appName} depuis Telegram.` });
}
