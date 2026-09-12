import fs from 'node:fs';
import path from 'node:path';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { config, runtime } from './config.js';
import { t, langueDe } from './i18n.js';
import { store } from './store.js';

export const bot = config.botToken ? new Bot(config.botToken) : null;

// Construit l'adresse de la mini app avec l'écran à ouvrir (ex. ?screen=chat&match=abc)
export function appUrl(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return `${config.webAppUrl}/${qs ? `?${qs}` : ''}`;
}

// Envoie un message du bot avec un bouton qui ouvre directement le bon écran de la mini app.
// throttleKey + throttleMs évitent d'inonder l'utilisateur (ex. une notification par discussion toutes les 2 minutes).
// Renvoie { sent: true } ou { sent: false, reason }.
// Le texte arrive sous forme de clé française et de valeurs : c'est ici, au moment de l'envoi,
// qu'on sait dans quelle langue écrire, puisque c'est celle de la personne qui reçoit.
export async function notify(userId, cle, vars, button, throttleKey, throttleMs = 2 * 60 * 1000) {
  const user = await store.getUser(userId);
  if (!bot) return { sent: false, reason: 'NO_BOT' };
  if (!user || user.demo) return { sent: false, reason: 'NO_USER' };
  const lang = langueDe(user);
  const text = t(lang, cle, vars);
  if (throttleKey) {
    const last = user.lastNotifiedAt?.[throttleKey] || 0;
    if (Date.now() - last < throttleMs) return { sent: false, reason: 'THROTTLED' };
    await store.updateUser(userId, { lastNotifiedAt: { ...user.lastNotifiedAt, [throttleKey]: Date.now() } });
  }
  const reply_markup = button && config.webAppUrl ? new InlineKeyboard().webApp(t(lang, button.label, { app: config.appName }), appUrl(button.params)) : undefined;
  try {
    await bot.api.sendMessage(userId, text, { reply_markup });
    return { sent: true };
  } catch (e) {
    // L'utilisateur a peut-être bloqué le bot : on ne plante pas le serveur
    console.warn(`Notification impossible pour ${userId} : ${e.description || e.message}`);
    return { sent: false, reason: 'TELEGRAM_ERROR', detail: e.description || e.message };
  }
}

// Permet aux routes de réagir à une validation (ex. profil de démo qui « like » le nouveau membre)
let approvedHook = null;
export const onApproved = (fn) => { approvedHook = fn; };

export async function notifyAdmin(text, reply_markup) {
  if (!bot || !config.adminChatId) return;
  await bot.api.sendMessage(config.adminChatId, text, { reply_markup }).catch((e) => console.warn('Message à la modération impossible :', e.message));
}

// Bouton posé sous les messages où la modération voit passer un nom : signalement, message bloqué.
// La décision reste dans Telegram, là où elle se prend déjà pour les selfies et les photos.
export const boutonBannir = (userId) => new InlineKeyboard().text('Fermer ce compte', `ban:${userId}`);

// Le groupe de modération n'avait jamais servi tant qu'AUTO_APPROVE validait tout le monde.
// Un identifiant mal recopié, ou un bot qu'on a oublié d'ajouter au groupe, ne se verrait
// qu'au premier vrai selfie — c'est-à-dire chez la première personne qui essaie de s'inscrire,
// et sans que personne d'autre l'apprenne. On pose donc la question au démarrage, une fois,
// là où la réponse est encore lisible dans le journal de déploiement.
export async function verifierGroupeModeration() {
  if (!bot || !config.adminChatId) return { ok: false, raison: 'NON_CONFIGURE' };
  try {
    const chat = await bot.api.getChat(config.adminChatId);
    console.log(`Modération : les selfies et les photos partent vers « ${chat.title || chat.username || chat.id} ».`);
    return { ok: true, titre: chat.title || chat.username || String(chat.id) };
  } catch (e) {
    const detail = e.description || e.message;
    console.error([
      `Groupe de modération injoignable (ADMIN_CHAT_ID=${config.adminChatId}) : ${detail}.`,
      "Tant que ça dure, aucun selfie n'arrive en modération et personne ne peut être vérifié.",
      "À vérifier : que le bot est bien membre du groupe, et que l'identifiant est celui que /id a renvoyé dans ce groupe.",
    ].join('\n'));
    return { ok: false, raison: 'INJOIGNABLE', detail };
  }
}

export async function sendSelfieToModeration(userId) {
  const user = await store.getUser(userId);
  const file = path.join(config.uploadsDir, `${userId}-selfie.jpg`);
  if (!bot || !config.adminChatId || !fs.existsSync(file)) return false;
  const keyboard = new InlineKeyboard().text('Valider', `approve:${userId}`).text('Refuser', `reject:${userId}`);
  await bot.api.sendPhoto(config.adminChatId, new InputFile(file), {
    caption: `Vérification de ${user.profile?.name || user.firstName}, ${user.profile?.age || '?'} ans\nGeste demandé : ${user.pendingGesture || 'deux doigts levés'}\nID : ${userId}`,
    reply_markup: keyboard,
  });
  return true;
}

// Décision de modération : le selfie est supprimé dans tous les cas, comme promis à l'utilisateur.
// Chaque photo de profil passe par la même modération que le selfie, avec ses propres boutons
export async function sendPhotoToModeration(userId, n) {
  const user = await store.getUser(userId);
  const file = path.join(config.uploadsDir, `${userId}-photo-${n}.jpg`);
  if (!bot || !config.adminChatId || !fs.existsSync(file)) return false;
  const keyboard = new InlineKeyboard().text('Valider', `photo:approve:${userId}:${n}`).text('Refuser', `photo:reject:${userId}:${n}`);
  await bot.api.sendPhoto(config.adminChatId, new InputFile(file), {
    caption: `Photo ${n} de ${user.profile?.name || user.firstName}, ${user.profile?.age || '?'} ans\nID : ${userId}`,
    reply_markup: keyboard,
  });
  return true;
}
// Refusée, la photo est supprimée : on ne garde pas ce qu'on ne montrera pas. La personne sait pourquoi.
export async function decidePhoto(userId, n, approved) {
  const user = await store.getUser(userId);
  if (!user || !(await store.photosOf(user)).some((p) => p.n === n)) return; // retirée entre-temps
  if (approved) {
    await store.setPhoto(userId, n, 'approved');
    await notify(userId, 'Ta photo {n} est validée : les autres la voient maintenant.', { n }, { label: 'Voir mon profil', params: { screen: 'me' } });
  } else {
    await store.removePhoto(userId, n);
    await notify(userId, "Ta photo {n} a été refusée : visage peu visible, contenu inadapté, ou ce n'est pas toi. Elle est supprimée, tu peux en mettre une autre.", { n }, { label: 'Changer de photo', params: { screen: 'me' } });
  }
}

export async function decideVerification(userId, approved) {
  const user = await store.getUser(userId);
  if (!user) return;
  // Le délai de modération n'existait nulle part : verificationSentAt donne le départ, celui-ci
  // l'arrivée. C'est le chiffre qui manque le plus à l'équipe (audit/05-mesure-produit.md).
  await store.updateUser(userId, { verification: approved ? 'approved' : 'rejected', pendingGesture: null, verifDecidedAt: Date.now() });
  const file = path.join(config.uploadsDir, `${userId}-selfie.jpg`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  if (approved) {
    approvedHook?.(userId);
    await notify(userId, 'Ton profil est vérifié. Ton badge est visible, tu peux découvrir des profils.', null, { label: 'Voir des profils', params: { screen: 'discover' } });
  } else {
    await notify(userId, "Ta vérification n'a pas abouti : le geste ou le visage n'était pas assez visible. Tu peux réessayer.", null, { label: 'Réessayer', params: { screen: 'verify' } });
  }
}

// Retire la photo du groupe de modération et laisse à la place une ligne de texte : la trace de
// la décision reste, l'image ne reste pas. Si Telegram refuse la suppression (message trop ancien),
// on retombe sur la légende modifiée plutôt que de perdre la trace.
async function effacerEtTracer(ctx, trace) {
  const efface = await ctx.deleteMessage().then(() => true).catch(() => false);
  if (efface) await ctx.api.sendMessage(config.adminChatId, trace).catch(() => {});
  else await ctx.editMessageCaption({ caption: trace }).catch(() => {});
}

export async function setupBot() {
  if (!bot) {
    console.warn('BOT_TOKEN absent : le bot est désactivé (seule l\'API tourne).');
    return;
  }

  bot.command('start', async (ctx) => {
    const lang = langueDe(await store.getUser(ctx.from?.id) || { languageCode: ctx.from?.language_code });
    const text = t(lang, "Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans jamais te demander d'argent.\n\nRéservé aux 18 ans et plus.", { nom: ctx.from?.first_name || '', app: config.appName });
    const reply_markup = config.webAppUrl ? new InlineKeyboard().webApp(t(lang, 'Ouvrir {app}', { app: config.appName }), appUrl()) : undefined;
    await ctx.reply(text, { reply_markup });
  });

  // Permet de connaître l'identifiant de la discussion à mettre dans ADMIN_CHAT_ID
  bot.command('id', async (ctx) => ctx.reply(t(langueDe(await store.getUser(ctx.from?.id)), 'Identifiant de cette discussion : {id}', { id: ctx.chat.id })));

  bot.command('aide', async (ctx) =>
    ctx.reply(t(langueDe((await store.getUser(ctx.from?.id)) || { languageCode: ctx.from?.language_code }),
      "{app} ne te demandera jamais d'argent. Si quelqu'un le fait, signale-le depuis la discussion dans l'app.\n\nPour supprimer ton compte : Paramètres dans l'app, puis « Supprimer mon compte ».",
      { app: config.appName })),
  );

  bot.callbackQuery(/^(approve|reject):(.+)$/, async (ctx) => {
    if (String(ctx.chat?.id) !== String(config.adminChatId)) return ctx.answerCallbackQuery({ text: 'Action réservée à la modération.' });
    const [, action, userId] = ctx.match;
    await decideVerification(userId, action === 'approve');
    // Le selfie est supprimé du disque ET du groupe : une légende modifiée laissait l'image
    // visible indéfiniment dans Telegram, ce que la promesse faite à la personne exclut.
    await effacerEtTracer(ctx, `Vérification ${action === 'approve' ? 'validée' : 'refusée'} par ${ctx.from.first_name} (ID ${userId})`);
    await ctx.answerCallbackQuery({ text: action === 'approve' ? 'Profil validé' : 'Profil refusé' });
  });

  // Fermer un compte, et rouvrir en cas d'erreur. Réservé au groupe de modération, comme les
  // deux décisions au-dessus : le compte fermé perd l'accès à l'API et disparaît de la découverte,
  // ses matchs sont défaits, et la trace dit qui a décidé, quand et pourquoi.
  bot.callbackQuery(/^ban:(\d+)$/, async (ctx) => {
    if (String(ctx.chat?.id) !== String(config.adminChatId)) return ctx.answerCallbackQuery({ text: 'Action réservée à la modération.' });
    const userId = ctx.match[1];
    const u = await store.banUser(userId, { motif: 'décision de la modération', par: ctx.from.first_name });
    if (!u) return ctx.answerCallbackQuery({ text: 'Ce compte n\'existe plus.' });
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text('Rouvrir ce compte', `unban:${userId}`) }).catch(() => {});
    await ctx.api.sendMessage(config.adminChatId, `Compte fermé par ${ctx.from.first_name} (ID ${userId})`).catch(() => {});
    await ctx.answerCallbackQuery({ text: 'Compte fermé' });
  });

  bot.callbackQuery(/^unban:(\d+)$/, async (ctx) => {
    if (String(ctx.chat?.id) !== String(config.adminChatId)) return ctx.answerCallbackQuery({ text: 'Action réservée à la modération.' });
    const userId = ctx.match[1];
    const u = await store.unbanUser(userId);
    if (!u) return ctx.answerCallbackQuery({ text: 'Ce compte n\'existe plus.' });
    await ctx.editMessageReplyMarkup({ reply_markup: boutonBannir(userId) }).catch(() => {});
    await ctx.api.sendMessage(config.adminChatId, `Compte rouvert par ${ctx.from.first_name} (ID ${userId})`).catch(() => {});
    await ctx.answerCallbackQuery({ text: 'Compte rouvert' });
  });

  bot.callbackQuery(/^photo:(approve|reject):(\d+):([123])$/, async (ctx) => {
    if (String(ctx.chat?.id) !== String(config.adminChatId)) return ctx.answerCallbackQuery({ text: 'Action réservée à la modération.' });
    const [, action, userId, n] = ctx.match;
    await decidePhoto(userId, Number(n), action === 'approve');
    await effacerEtTracer(ctx, `Photo ${n} ${action === 'approve' ? 'validée' : 'refusée'} par ${ctx.from.first_name} (ID ${userId})`);
    await ctx.answerCallbackQuery({ text: action === 'approve' ? 'Photo validée' : 'Photo refusée' });
  });

  bot.catch((err) => console.error('Erreur du bot :', err.error?.message || err.message));
}

// Telegram refuse parfois le webhook pour une cause passagère : nom de domaine pas encore
// résolu après l'allocation d'une adresse publique, coupure réseau au démarrage. Sans reprise,
// le bot restait muet jusqu'au prochain redémarrage — et comme c'est l'appel du webhook qui
// réveille une machine arrêtée, l'échec s'entretenait lui-même.
export const WEBHOOK_RETRY_DELAYS_MS = [5e3, 15e3, 30e3, 60e3, 120e3, 300e3];

// Ne jette jamais : le serveur doit rester debout même si Telegram refuse.
export async function poseWebhook(url, { delais = WEBHOOK_RETRY_DELAYS_MS } = {}) {
  for (let essai = 0; ; essai += 1) {
    try {
      await bot.api.setWebhook(url);
      console.log(essai ? `Bot en mode webhook (tentative ${essai + 1})` : 'Bot en mode webhook');
      return true;
    } catch (e) {
      if (essai >= delais.length) {
        console.error(`Webhook non posé après ${essai + 1} tentatives : ${e.message}. Il sera reposé au prochain démarrage.`);
        return false;
      }
      console.warn(`Webhook refusé (${e.message}), nouvelle tentative dans ${Math.round(delais[essai] / 1000)} s.`);
      await new Promise((r) => setTimeout(r, delais[essai]));
    }
  }
}

// delais : uniquement pour les tests, afin de ne pas attendre les vraies reprises
export async function startBot(app, { delais } = {}) {
  if (!bot) return;
  const me = await bot.api.getMe();
  runtime.botUsername = me.username;
  if (config.webAppUrl) {
    // Bouton « Ouvrir » à côté du champ de saisie, pour toutes les discussions avec le bot
    await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Ouvrir', web_app: { url: appUrl() } } }).catch((e) => console.warn('Bouton de menu non configuré :', e.message));
  }
  // Un groupe injoignable ferme l'inscription à tout le monde : autant l'apprendre maintenant.
  // On ne s'arrête pas pour autant — une panne passagère de Telegram ne doit pas coucher l'app.
  await verifierGroupeModeration();

  // Purement cosmétique : un échec ici ne doit pas empêcher la pose du webhook
  await bot.api.setMyCommands([
    { command: 'start', description: `Ouvrir ${config.appName}` },
    { command: 'aide', description: 'Sécurité et aide' },
  ]).catch((e) => console.warn('Commandes non publiées :', e.message));

  if (config.useWebhook) {
    const { webhookCallback } = await import('grammy');
    const secretPath = `/telegram/${config.botToken.split(':')[0]}-${config.adminKey || 'hook'}`;
    app.use(secretPath, webhookCallback(bot, 'express'));
    // Sans await : le serveur répond tout de suite, la reprise se poursuit en arrière-plan
    poseWebhook(`${config.webAppUrl}${secretPath}`, delais ? { delais } : {});
  } else {
    await bot.api.deleteWebhook();
    bot.start({ onStart: (me) => console.log(`Bot @${me.username} démarré (interrogation longue)`) });
  }
}
