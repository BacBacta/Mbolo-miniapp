// Ouvrir une session de modération sur le web, sans inventer un annuaire de modérateurs.
//
// La question « qui a le droit » a déjà une réponse dans Telegram : les administrateurs du groupe
// de modération. Une liste d'identifiants dans une variable d'environnement dirait la même chose,
// mais se périmerait en silence — quelqu'un qu'on retire du groupe garderait ses droits, et
// personne ne s'en apercevrait. On demande donc à Telegram, à chaque fois.
//
// Le lien vaut dix minutes et ne sert qu'une fois. Il part en message privé : posé dans le
// groupe, il s'ouvrirait d'un clic pour n'importe quel membre, et tout membre du groupe n'est
// pas administrateur.
import crypto from 'node:crypto';
import express from 'express';
import { config } from './config.js';
import { store } from './store.js';
import { bot, appUrl } from './bot.js';
import { COOKIE_MODERATION, signer, verifier, lireCookie, optionsCookie, effacerCookie } from './session.js';

// Interroger Telegram à chaque requête coûterait un appel réseau par clic. Le cache est court
// exprès : quelqu'un qu'on retire des administrateurs perd l'accès dans la minute, pas à la fin
// de sa session. C'est un cache, pas un état — le perdre au redémarrage ne coûte qu'un appel.
const CACHE_ADMINS_MS = 60 * 1000;
// Telegram peut tomber. Plutôt que de fermer la modération à la première coupure, on garde la
// dernière liste connue — mais pas indéfiniment : passé ce délai, ne plus savoir qui est
// administrateur veut dire ne laisser entrer personne.
const CACHE_PANNE_MS = 10 * 60 * 1000;
let cacheAdmins = { at: 0, ids: null };

export function oublierLesAdmins() {
  cacheAdmins = { at: 0, ids: null };
}

export async function administrateurs() {
  if (cacheAdmins.ids && Date.now() - cacheAdmins.at < CACHE_ADMINS_MS) return cacheAdmins.ids;
  if (!bot || !config.adminChatId) return new Set();
  try {
    const membres = await bot.api.getChatAdministrators(config.adminChatId);
    const ids = new Set(membres.filter((m) => !m.user?.is_bot).map((m) => String(m.user.id)));
    cacheAdmins = { at: Date.now(), ids };
    return ids;
  } catch (e) {
    console.warn('Administrateurs du groupe de modération illisibles :', e.description || e.message);
    if (cacheAdmins.ids && Date.now() - cacheAdmins.at < CACHE_PANNE_MS) return cacheAdmins.ids;
    return new Set();
  }
}

export const estAdministrateur = async (userId) => (await administrateurs()).has(String(userId));

// Le jeton porte l'identifiant et un numéro tiré au hasard. La signature empêche de le fabriquer,
// le numéro gardé sur le compte fait qu'il ne sert qu'une fois : on le compare, puis on l'efface.
export async function creerLienModeration(userId) {
  const usage = crypto.randomUUID();
  await store.updateUser(userId, { modJeton: usage });
  const jeton = signer({ id: String(userId), u: usage }, config.modLienSec);
  return jeton && `${appUrl()}moderation?jeton=${encodeURIComponent(jeton)}`;
}

// Renvoie { ok: true, user } ou { ok: false, raison } — chaque refus a sa phrase côté appelant.
export async function echangerLeJeton(jeton) {
  const donnees = verifier(jeton);
  if (!donnees?.id || !donnees?.u) return { ok: false, raison: 'JETON_INVALIDE' };
  const user = await store.getUser(donnees.id);
  if (!user || user.modJeton !== donnees.u) return { ok: false, raison: 'JETON_UTILISE' };
  // Effacé avant toute autre vérification : même refusé, un lien a servi.
  await store.updateUser(user.id, { modJeton: null });
  if (!(await estAdministrateur(user.id))) return { ok: false, raison: 'PAS_ADMIN' };
  return { ok: true, user };
}

// La session dit qui tu es ; elle ne dit pas que tu as encore le droit. C'est revérifié ici, à
// chaque requête, contre la liste que Telegram tient — sinon perdre ses droits ne coûterait rien
// jusqu'à l'expiration du cookie.
export async function requireModerateur(req, res, next) {
  if (!config.webSessionSecret) {
    return res.status(503).json({
      code: 'MOD_INDISPONIBLE',
      message: "L'espace de modération n'est pas configuré sur ce serveur. Renseigne WEB_SESSION_SECRET, puis redémarre.",
    });
  }
  const session = verifier(lireCookie(req, COOKIE_MODERATION));
  if (!session?.id) return res.status(401).json({ code: 'MOD_SESSION', message: 'Session expirée. Retourne dans le groupe de modération et envoie /moderation.' });
  if (!(await estAdministrateur(session.id))) {
    effacerCookie(res, COOKIE_MODERATION);
    return res.status(403).json({ code: 'MOD_PAS_ADMIN', message: "Tu n'es plus administrateur du groupe de modération." });
  }
  const moi = await store.getUser(session.id);
  // Ceinture et bretelles : un compte que la modération a fermé ne modère pas, fût-il
  // administrateur du groupe. Les deux notions sont indépendantes, donc rien ne l'empêcherait.
  if (!moi || moi.banned) {
    effacerCookie(res, COOKIE_MODERATION);
    return res.status(403).json({ code: 'MOD_PAS_ADMIN', message: "Ce compte ne peut pas accéder à l'espace de modération." });
  }
  req.moderateur = moi;
  next();
}

export const modApi = express.Router();

modApi.get('/me', requireModerateur, async (req, res) => {
  res.json({ id: req.moderateur.id, prenom: req.moderateur.firstName || req.moderateur.profile?.name || '' });
});

// Les selfies ne sont pas servis ici : ils restent réservés au groupe Telegram, comme promis.
// Cette file dit qui attend et depuis quand, pas à quoi la personne ressemble.
modApi.get('/verifications', requireModerateur, async (req, res) => {
  const users = await store.allUsers();
  const attente = users
    .filter((u) => u.verification === 'pending' && !u.banned)
    .sort((a, b) => (a.verificationSentAt || a.createdAt || 0) - (b.verificationSentAt || b.createdAt || 0))
    .map((u) => ({ id: u.id, prenom: u.profile?.name || u.firstName || '', depuis: u.verificationSentAt || u.createdAt || null, geste: u.pendingGesture || null }));
  res.json({ verifications: attente });
});

modApi.get('/signalements', requireModerateur, async (req, res) => {
  const reports = (await store.reports()).slice(-200).reverse();
  // Une seule lecture des comptes : deux getUser par ligne, c'est quatre cents allers-retours
  // vers PostgreSQL pour deux cents signalements.
  const noms = new Map((await store.allUsers()).map((u) => [u.id, u.profile?.name || u.firstName || '']));
  res.json({ signalements: reports.map((r) => ({ ...r, nomCible: noms.get(String(r.targetId)) || '', nomAuteur: noms.get(String(r.from)) || '' })) });
});

modApi.get('/comptes-fermes', requireModerateur, async (req, res) => {
  const bannis = await store.bannis();
  res.json({ comptes: bannis.map((u) => ({ id: u.id, prenom: u.profile?.name || u.firstName || '', ...u.banned })) });
});

modApi.delete('/session', (req, res) => {
  effacerCookie(res, COOKIE_MODERATION);
  res.json({ ferme: true });
});

modApi.use((req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Route inconnue.' }));

// La commande vit ici et non dans bot.js : bot.js ne connaît pas la modération web, c'est la
// modération web qui connaît le bot. Une seule direction, donc pas de dépendance circulaire.
export function commandesModeration() {
  if (!bot) return;
  bot.command('moderation', async (ctx) => {
    if (String(ctx.chat?.id) !== String(config.adminChatId)) {
      return ctx.reply("Cette commande ne s'utilise que dans le groupe de modération.");
    }
    if (!config.webSessionSecret) {
      return ctx.reply("L'espace de modération n'est pas configuré : il manque WEB_SESSION_SECRET sur le serveur.");
    }
    if (!config.webAppUrl) {
      return ctx.reply("Le serveur ne connaît pas son adresse publique : renseigne WEBAPP_URL, sinon le lien ne mènerait nulle part.");
    }
    oublierLesAdmins();
    if (!(await estAdministrateur(ctx.from.id))) {
      return ctx.reply(`${ctx.from.first_name}, seuls les administrateurs du groupe peuvent ouvrir l'espace de modération.`);
    }
    const lien = await creerLienModeration(ctx.from.id);
    try {
      await ctx.api.sendMessage(ctx.from.id, `Ton lien pour ouvrir l'espace de modération. Il vaut dix minutes et ne sert qu'une fois.\n\n${lien}`);
      await ctx.reply(`${ctx.from.first_name}, ton lien est parti en message privé.`);
    } catch {
      // Telegram interdit d'écrire à quelqu'un qui n'a jamais ouvert de discussion avec le bot.
      await ctx.reply(`${ctx.from.first_name}, je ne peux pas t'écrire en privé. Ouvre une discussion avec moi, envoie /start, puis retente ici.`);
    }
  });
}

// ---------- La page ----------
// Volontairement maigre : cette pull request pose la session, pas le tableau de bord. Elle dit
// qui est connecté et ce qui attend, sans JavaScript ni selfie. Le vrai écran vient ensuite.
const echapper = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const page = (assetV, titre, corps) => `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <meta name="robots" content="noindex, nofollow">
  <title>${echapper(titre)} — ${echapper(config.appName)}</title>
  <link rel="stylesheet" href="/styles.css?v=${assetV}">
  <script>try{document.documentElement.dataset.scheme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}catch(e){}</script>
</head>
<body class="doc-page">
<main class="doc">
  <h1>${echapper(titre)}</h1>
${corps}
</main>
</body>
</html>`;

const REFUS = {
  JETON_INVALIDE: "Ce lien n'est pas valable. Il a peut-être expiré : ils durent dix minutes.",
  JETON_UTILISE: "Ce lien a déjà servi. Retourne dans le groupe de modération et envoie /moderation pour en recevoir un autre.",
  PAS_ADMIN: "Tu n'es pas administrateur du groupe de modération.",
};

export function creerPageModeration(assetV) {
  return async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!config.webSessionSecret) {
      return res.status(503).type('html').send(page(assetV, 'Espace de modération', "<p>Cet espace n'est pas configuré sur ce serveur. Renseigne <code>WEB_SESSION_SECRET</code>, puis redémarre.</p>"));
    }
    // Le jeton voyage dans l'adresse : on l'échange tout de suite contre un cookie, puis on
    // renvoie vers une adresse propre. Sans cela il resterait dans l'historique du navigateur.
    if (req.query.jeton) {
      const r = await echangerLeJeton(req.query.jeton);
      if (!r.ok) return res.status(403).type('html').send(page(assetV, 'Lien refusé', `<p>${echapper(REFUS[r.raison])}</p>`));
      res.cookie(COOKIE_MODERATION, signer({ id: String(r.user.id) }, config.modSessionSec), optionsCookie(config.modSessionSec));
      return res.redirect(303, '/moderation');
    }
    const session = verifier(lireCookie(req, COOKIE_MODERATION));
    if (!session?.id || !(await estAdministrateur(session.id))) {
      return res.status(401).type('html').send(page(assetV, 'Espace de modération',
        "<p>Pour entrer : va dans le groupe de modération sur Telegram et envoie <code>/moderation</code>. Le bot t'envoie un lien en privé.</p>"));
    }
    const moi = await store.getUser(session.id);
    const users = await store.allUsers();
    const attente = users.filter((u) => u.verification === 'pending' && !u.banned).length;
    const signalements = (await store.reports()).length;
    const fermes = (await store.bannis()).length;
    res.type('html').send(page(assetV, 'Espace de modération', [
      `  <p class="doc-chapo">Session ouverte au nom de ${echapper(moi?.firstName || moi?.profile?.name || session.id)}.</p>`,
      '  <ul>',
      `    <li><strong>${attente}</strong> vérification(s) en attente</li>`,
      `    <li><strong>${signalements}</strong> signalement(s)</li>`,
      `    <li><strong>${fermes}</strong> compte(s) fermé(s)</li>`,
      '  </ul>',
      "  <p>Les décisions se prennent toujours dans le groupe Telegram : les selfies n'arrivent pas ici et n'arriveront pas.</p>",
    ].join('\n')));
  };
}
