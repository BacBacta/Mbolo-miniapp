import fs from 'node:fs';
import path from 'node:path';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { config, runtime } from './config.js';
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
export async function notify(userId, text, button, throttleKey, throttleMs = 2 * 60 * 1000) {
  const user = store.getUser(userId);
  if (!bot) return { sent: false, reason: 'NO_BOT' };
  if (!user || user.demo) return { sent: false, reason: 'NO_USER' };
  if (throttleKey) {
    const last = user.lastNotifiedAt?.[throttleKey] || 0;
    if (Date.now() - last < throttleMs) return { sent: false, reason: 'THROTTLED' };
    store.updateUser(userId, { lastNotifiedAt: { ...user.lastNotifiedAt, [throttleKey]: Date.now() } });
  }
  const reply_markup = button && config.webAppUrl ? new InlineKeyboard().webApp(button.label, appUrl(button.params)) : undefined;
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

export async function notifyAdmin(text) {
  if (!bot || !config.adminChatId) return;
  await bot.api.sendMessage(config.adminChatId, text).catch((e) => console.warn('Message à la modération impossible :', e.message));
}

export async function sendSelfieToModeration(userId) {
  const user = store.getUser(userId);
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
export async function decideVerification(userId, approved) {
  const user = store.getUser(userId);
  if (!user) return;
  store.updateUser(userId, { verification: approved ? 'approved' : 'rejected', pendingGesture: null });
  const file = path.join(config.uploadsDir, `${userId}-selfie.jpg`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  if (approved) {
    approvedHook?.(userId);
    await notify(userId, 'Ton profil est vérifié. Ton badge est visible, tu peux découvrir des profils.', { label: 'Voir des profils', params: { screen: 'discover' } });
  } else {
    await notify(userId, "Ta vérification n'a pas abouti : le geste ou le visage n'était pas assez visible. Tu peux réessayer.", { label: 'Réessayer', params: { screen: 'verify' } });
  }
}

export function setupBot() {
  if (!bot) {
    console.warn('BOT_TOKEN absent : le bot est désactivé (seule l\'API tourne).');
    return;
  }

  bot.command('start', async (ctx) => {
    const name = ctx.from?.first_name || '';
    const text = `Salut ${name}. ${config.appName} te fait rencontrer des personnes vérifiées de ta ville, sans jamais te demander d'argent.\n\nRéservé aux 18 ans et plus.`;
    const reply_markup = config.webAppUrl ? new InlineKeyboard().webApp(`Ouvrir ${config.appName}`, appUrl()) : undefined;
    await ctx.reply(text, { reply_markup });
  });

  // Permet de connaître l'identifiant de la discussion à mettre dans ADMIN_CHAT_ID
  bot.command('id', (ctx) => ctx.reply(`Identifiant de cette discussion : ${ctx.chat.id}`));

  bot.command('aide', (ctx) =>
    ctx.reply(`${config.appName} ne te demandera jamais d'argent. Si quelqu'un le fait, signale-le depuis la discussion dans l'app.\n\nPour supprimer ton compte : Paramètres dans l'app, puis « Supprimer mon compte ».`),
  );

  bot.callbackQuery(/^(approve|reject):(.+)$/, async (ctx) => {
    if (String(ctx.chat?.id) !== String(config.adminChatId)) return ctx.answerCallbackQuery({ text: 'Action réservée à la modération.' });
    const [, action, userId] = ctx.match;
    await decideVerification(userId, action === 'approve');
    await ctx.editMessageCaption({ caption: `${action === 'approve' ? 'Validé' : 'Refusé'} par ${ctx.from.first_name} (ID ${userId})` });
    await ctx.answerCallbackQuery({ text: action === 'approve' ? 'Profil validé' : 'Profil refusé' });
  });

  bot.catch((err) => console.error('Erreur du bot :', err.error?.message || err.message));
}

export async function startBot(app) {
  if (!bot) return;
  const me = await bot.api.getMe();
  runtime.botUsername = me.username;
  if (config.webAppUrl) {
    // Bouton « Ouvrir » à côté du champ de saisie, pour toutes les discussions avec le bot
    await bot.api.setChatMenuButton({ menu_button: { type: 'web_app', text: 'Ouvrir', web_app: { url: appUrl() } } }).catch((e) => console.warn('Bouton de menu non configuré :', e.message));
  }
  await bot.api.setMyCommands([
    { command: 'start', description: `Ouvrir ${config.appName}` },
    { command: 'aide', description: 'Sécurité et aide' },
  ]);

  if (config.useWebhook) {
    const { webhookCallback } = await import('grammy');
    const secretPath = `/telegram/${config.botToken.split(':')[0]}-${config.adminKey || 'hook'}`;
    app.use(secretPath, webhookCallback(bot, 'express'));
    await bot.api.setWebhook(`${config.webAppUrl}${secretPath}`);
    console.log('Bot en mode webhook');
  } else {
    await bot.api.deleteWebhook();
    bot.start({ onStart: (me) => console.log(`Bot @${me.username} démarré (interrogation longue)`) });
  }
}
