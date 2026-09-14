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
import { envelopper } from './promesses.js';

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

// Même enveloppe que l'API : sans elle, un gestionnaire qui rejette arrêtait le processus.
export const modApi = envelopper(express.Router());

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

// ---------- Le fil d'une discussion signalée ----------
// Ce que la modération peut lire, c'est la discussion **signalée**, et elle seule : pas les
// autres conversations de la personne, pas celles de qui a signalé. Sans le fil, un signalement
// se résume à un motif choisi dans une liste — impossible de distinguer une vraie arnaque d'une
// dispute. Avec le fil, on lit ce que deux personnes se sont dit : ça se paie d'une trace.
modApi.get('/signalements/:id/fil', requireModerateur, async (req, res) => {
  const signalement = (await store.reports()).find((r) => r.id === req.params.id);
  if (!signalement) return res.status(404).json({ code: 'NOT_FOUND', message: 'Ce signalement n\'existe pas.' });
  const fil = await filDuSignalement(signalement, req.moderateur.id);
  if (!fil) return res.status(404).json({ code: 'SANS_FIL', message: "Ce signalement ne porte sur aucune discussion : il n'y a rien à lire." });
  res.json({ signalement, ...fil });
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

async function filDuSignalement(signalement, parQui) {
  if (!signalement.matchId) return null;
  const match = await store.getMatch(signalement.matchId);
  // Un match défait (blocage, compte fermé) emporte ses messages : il n'y a plus rien à lire,
  // et c'est voulu — on ne garde pas une copie des discussions pour la modération.
  if (!match) return null;
  await store.marquerSignalementLu(signalement.id, parQui);
  const messages = await store.messagesOf(match.id);
  const noms = new Map();
  for (const id of match.users) noms.set(String(id), (await store.getUser(id))?.profile?.name || '');
  return { messages: messages.map((m) => ({ ...m, nom: noms.get(String(m.from)) || '' })), participants: [...noms].map(([id, nom]) => ({ id, nom })) };
}

// ---------- La page ----------
// Sans JavaScript et sans image : la navigation passe par l'adresse. C'est l'écran qu'on ouvre
// depuis un téléphone d'entrée de gamme, sur un forfait compté, pour trancher vite.
const echapper = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const quand = (ms) => (ms
  ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short', timeStyle: 'short', timeZone: config.modTimezone }).format(new Date(Number(ms)))
  : '—');

const STYLE = `
  .mod-onglets { display: flex; flex-wrap: wrap; gap: .5rem; margin: 0 0 1.6rem; }
  .mod-onglets a { display: inline-block; padding: .45rem .8rem; border-radius: 999px; background: var(--bg3); text-decoration: none; font-size: .92rem; }
  .mod-onglets a[aria-current] { background: var(--button); color: var(--button-text); }
  .mod-liste { list-style: none; padding: 0; margin: 0; }
  .mod-liste > li { background: var(--bg); border: 1px solid var(--line); border-radius: 14px; padding: .8rem 1rem; margin: .6rem 0; }
  .mod-quand { color: var(--hint-doux); font-size: .85rem; }
  .mod-vide { color: var(--hint); }
  .mod-fil { list-style: none; padding: 0; margin: 1rem 0; }
  .mod-fil > li { max-width: 80%; background: var(--bg); border: 1px solid var(--line); border-radius: 14px; padding: .55rem .8rem; margin: .45rem 0; }
  .mod-fil > li.mod-cible { margin-left: auto; background: var(--bg3); }
  .mod-fil b { font-size: .82rem; color: var(--hint); font-weight: 600; }
  .mod-fil p { margin: .2rem 0 0; overflow-wrap: anywhere; }
`;

const page = (assetV, titre, corps) => `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <meta name="robots" content="noindex, nofollow">
  <title>${echapper(titre)} — ${echapper(config.appName)}</title>
  <link rel="stylesheet" href="/styles.css?v=${assetV}">
  <style>${STYLE}</style>
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

const ONGLETS = [['', 'Accueil'], ['verifications', 'Vérifications'], ['signalements', 'Signalements'], ['comptes', 'Comptes fermés']];
const onglets = (courant) => `  <nav class="mod-onglets">${ONGLETS
  .map(([vue, nom]) => `<a href="/moderation${vue ? `?vue=${vue}` : ''}"${vue === courant ? ' aria-current="page"' : ''}>${nom}</a>`)
  .join('')}</nav>`;

const liste = (elements, vide) => (elements.length
  ? `  <ul class="mod-liste">\n${elements.map((e) => `    <li>${e}</li>`).join('\n')}\n  </ul>`
  : `  <p class="mod-vide">${vide}</p>`);

async function vueVerifications() {
  const users = await store.allUsers();
  const attente = users
    .filter((u) => u.verification === 'pending' && !u.banned)
    .sort((a, b) => (a.verificationSentAt || a.createdAt || 0) - (b.verificationSentAt || b.createdAt || 0));
  return [
    "  <p class=\"doc-chapo\">Qui attend une décision, et depuis quand. Le selfie n'est pas ici : il est dans le groupe Telegram, avec les boutons Valider et Refuser. C'est là que la décision se prend.</p>",
    liste(
      attente.map((u) => `<strong>${echapper(u.profile?.name || u.firstName || u.id)}</strong>, ${echapper(u.profile?.age ?? '?')} ans — geste demandé : ${echapper(u.pendingGesture || '—')}<br><span class="mod-quand">envoyé le ${quand(u.verificationSentAt || u.createdAt)} · identifiant ${echapper(u.id)}</span>`),
      'Personne n\'attend.',
    ),
  ].join('\n');
}

async function vueSignalements() {
  const reports = (await store.reports()).slice(-200).reverse();
  const noms = new Map((await store.allUsers()).map((u) => [u.id, u.profile?.name || u.firstName || '']));
  const nom = (id) => echapper(noms.get(String(id)) || `compte ${id}`);
  return [
    '  <p class="doc-chapo">Du plus récent au plus ancien. Ouvrir un fil affiche ce que les deux personnes se sont dit — et laisse une trace de qui l\'a lu.</p>',
    liste(
      reports.map((r) => [
        `<strong>${nom(r.targetId)}</strong> signalé par ${nom(r.from)} — motif « ${echapper(r.reason || 'autre')} »`,
        `<br><span class="mod-quand">${quand(r.at)}${r.lectures?.length ? ` · lu ${r.lectures.length} fois` : ''}</span>`,
        r.matchId ? `<br><a href="/moderation?signalement=${encodeURIComponent(r.id)}">Lire le fil</a>` : '<br><span class="mod-vide">Aucune discussion rattachée.</span>',
      ].join('')),
      'Aucun signalement.',
    ),
  ].join('\n');
}

async function vueComptes() {
  const bannis = await store.bannis();
  return [
    '  <p class="doc-chapo">Les comptes fermés restent en base : c\'est ce qui permet de les reconnaître, comme les conditions l\'annoncent. Rouvrir se fait depuis le groupe Telegram.</p>',
    liste(
      bannis.map((u) => `<strong>${echapper(u.profile?.name || u.firstName || u.id)}</strong> — ${echapper(u.banned?.motif || 'sans motif')}<br><span class="mod-quand">fermé le ${quand(u.banned?.at)} par ${echapper(u.banned?.par || '—')} · identifiant ${echapper(u.id)}</span>`),
      'Aucun compte fermé.',
    ),
  ].join('\n');
}

async function vueFil(id, parQui) {
  const signalement = (await store.reports()).find((r) => r.id === id);
  if (!signalement) return '  <p class="mod-vide">Ce signalement n\'existe pas.</p>';
  const fil = await filDuSignalement(signalement, parQui);
  const entete = `  <p class="doc-chapo">Signalement du ${quand(signalement.at)}, motif « ${echapper(signalement.reason || 'autre')} ».</p>`;
  if (!fil) {
    return [entete, '  <p class="mod-vide">Cette discussion n\'existe plus : elle a été défaite par un blocage ou par la fermeture d\'un compte. Les messages partent avec elle et il n\'en reste aucune copie, y compris pour la modération — c\'est la phrase même de la politique de confidentialité.</p>'].join('\n');
  }
  const lignes = fil.messages.map((m) => {
    const cible = String(m.from) === String(signalement.targetId);
    return `    <li${cible ? ' class="mod-cible"' : ''}><b>${echapper(m.nom || (cible ? 'signalé' : 'a signalé'))} · ${quand(m.at)}</b><p>${echapper(m.text)}</p></li>`;
  });
  return [
    entete,
    `  <p class="mod-quand">Tu es la ${signalement.lectures?.length || 1}<sup>e</sup> lecture de ce fil. Chacune est enregistrée.</p>`,
    lignes.length ? `  <ul class="mod-fil">\n${lignes.join('\n')}\n  </ul>` : '  <p class="mod-vide">Cette discussion ne contient aucun message.</p>',
    '  <p>Pour fermer ce compte, retourne dans le groupe Telegram : le bouton est sous le signalement.</p>',
  ].join('\n');
}

export function creerPageModeration(assetV) {
  // Express 4 ne rattrape pas le rejet d'un gestionnaire asynchrone : sans ce filet, une panne
  // de la base laisserait l'onglet tourner indéfiniment au lieu de dire que ça ne va pas.
  return (req, res) => repondre(assetV, req, res).catch((e) => {
    console.error('Espace de modération :', e);
    if (!res.headersSent) res.status(500).type('html').send(page(assetV, 'Espace de modération', '<p>Quelque chose ne va pas de notre côté. Réessaie dans un instant.</p>'));
  });
}

async function repondre(assetV, req, res) {
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
  const moi = session?.id ? await store.getUser(session.id) : null;
  if (!moi || moi.banned || !(await estAdministrateur(session.id))) {
    return res.status(401).type('html').send(page(assetV, 'Espace de modération',
      "<p>Pour entrer : va dans le groupe de modération sur Telegram et envoie <code>/moderation</code>. Le bot t'envoie un lien en privé.</p>"));
  }

  if (req.query.signalement) {
    const corps = await vueFil(String(req.query.signalement), moi.id);
    return res.type('html').send(page(assetV, 'Fil signalé', [
      '  <p class="doc-retour"><a href="/moderation?vue=signalements">← Signalements</a></p>',
      corps,
    ].join('\n')));
  }

  const vue = String(req.query.vue || '');
  const corps = vue === 'verifications' ? await vueVerifications()
    : vue === 'signalements' ? await vueSignalements()
      : vue === 'comptes' ? await vueComptes()
        : await vueAccueil(moi);
  res.type('html').send(page(assetV, 'Espace de modération', `${onglets(vue)}\n${corps}\n${pied()}`));
}

async function vueAccueil(moi) {
  const users = await store.allUsers();
  const attente = users.filter((u) => u.verification === 'pending' && !u.banned).length;
  const signalements = (await store.reports()).length;
  const fermes = (await store.bannis()).length;
  return [
    `  <p class="doc-chapo">Session ouverte au nom de ${echapper(moi.firstName || moi.profile?.name || moi.id)}. Elle se ferme d'elle-même, et elle se ferme aussi si tu n'es plus administrateur du groupe.</p>`,
    '  <ul>',
    `    <li><a href="/moderation?vue=verifications"><strong>${attente}</strong> vérification(s) en attente</a></li>`,
    `    <li><a href="/moderation?vue=signalements"><strong>${signalements}</strong> signalement(s)</a></li>`,
    `    <li><a href="/moderation?vue=comptes"><strong>${fermes}</strong> compte(s) fermé(s)</a></li>`,
    '  </ul>',
  ].join('\n');
}

const pied = () => [
  '  <div class="doc-liens">',
  "    <p>Les décisions — valider, refuser, fermer un compte, le rouvrir — se prennent dans le groupe Telegram. Cet espace sert à voir, pas à trancher : une décision laisse une trace dans le groupe, là où l'équipe la lit.</p>",
  '  </div>',
].join('\n');
