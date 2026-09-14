import fs from 'node:fs';
import path from 'node:path';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { config, runtime } from './config.js';
import { t, langueDe } from './i18n.js';
import { store } from './store.js';
import { mesurer } from './mesure.js';
import { PREFIXE, porteurDuCode, accepter, refuser, retirer, membresQuiMOntChoisi } from './confiance.js';
import { refusDuree, fichierVoix, DUREE_MAX_S } from './voix.js';
import { consommer } from './limites.js';

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

// Écrire à quelqu'un qui n'est pas membre : la personne de confiance, et elle seule.
//
// notify() cherche un compte et rend la main quand il n'y en a pas — c'est voulu, il ne doit
// jamais écrire à un inconnu. La personne de confiance est l'exception : elle a explicitement
// accepté, dans Telegram, après avoir lu ce qu'elle recevrait. Sa langue est celle qu'elle a
// annoncée à ce moment-là ; on ne peut pas la lire ailleurs, puisqu'elle n'a pas de profil.
export async function direATiers(chatId, lang, cle, vars) {
  if (!bot || !chatId) return { sent: false, reason: 'NO_BOT' };
  try {
    await bot.api.sendMessage(chatId, t(langueDe({ languageCode: lang }), cle, vars));
    return { sent: true };
  } catch (e) {
    // Elle a peut-être bloqué le bot : on ne plante pas la requête d'un membre pour autant.
    console.warn(`Message à une personne de confiance impossible (${chatId}) : ${e.description || e.message}`);
    return { sent: false, reason: 'TELEGRAM_ERROR' };
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

// Le nom que Telegram affiche en haut de la discussion et sur la fiche du bot.
//
// Il ne vient pas d'APP_NAME : il vit chez Telegram, posé une fois à la main dans BotFather.
// Renommer l'app laissait donc l'ancien nom sur le bot — c'est exactement ce qui est arrivé au
// passage à Odo, et rien dans le dépôt ne pouvait le voir, puisque la valeur n'y est pas. La
// règle 12 dit que le nom ne s'écrit nulle part en dur ; ici on va plus loin, c'est le serveur
// qui l'impose à Telegram, et la dérive ne peut plus revenir.
//
// **Seulement s'il diffère** : Telegram limite les changements de nom, et une app qui se
// renommerait à chaque démarrage finirait par se voir refuser le changement le jour où il compte.
// Un échec ne couche pas le démarrage — c'est de l'affichage, pas une porte d'inscription.
export async function alignerLeNom() {
  if (!bot) return { ok: false, raison: 'PAS_DE_BOT' };
  try {
    const actuel = (await bot.api.getMyName()).name;
    if (actuel === config.appName) return { ok: true, change: false, nom: actuel };
    // Le nom se passe en argument, pas dans un objet : grammY attend setMyName(nom). Passer
    // { name } envoyait un objet là où Telegram attend une chaîne, et le nom restait l'ancien
    // — sans que rien ne le montre, puisque l'échec ne fait qu'un avertissement dans le journal.
    await bot.api.setMyName(config.appName);
    console.log(`Nom du bot aligné sur APP_NAME : « ${actuel} » → « ${config.appName} ».`);
    return { ok: true, change: true, avant: actuel, nom: config.appName };
  } catch (e) {
    const detail = e.description || e.message;
    console.warn([
      `Nom du bot non aligné sur APP_NAME (${detail}).`,
      `Telegram continue d'afficher l'ancien nom. À corriger dans BotFather : /mybots, ton bot, Edit Bot, Edit Name — « ${config.appName} ».`,
    ].join('\n'));
    return { ok: false, raison: 'REFUSE', detail };
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

// La présentation vocale part à la modération comme une photo, avec ses propres boutons. Elle
// doit être **écoutée** : aucune règle automatique ne lit la voix, et rien n'empêche quelqu'un d'y
// dire son numéro. C'est le seul filtre qui existe pour ce canal.
export async function sendVoiceToModeration(userId) {
  const user = await store.getUser(userId);
  const file = path.join(config.uploadsDir, fichierVoix(userId));
  if (!bot || !config.adminChatId || !fs.existsSync(file)) return false;
  const keyboard = new InlineKeyboard().text('Valider', `voix:approve:${userId}`).text('Refuser', `voix:reject:${userId}`);
  await bot.api.sendVoice(config.adminChatId, new InputFile(file), {
    caption: `Présentation vocale de ${user.profile?.name || user.firstName}, ${user.profile?.age || '?'} ans\nID : ${userId}\nÉcoute-la : ni les numéros ni les demandes d'argent ne sont détectables dans la voix.`,
    reply_markup: keyboard,
  });
  return true;
}

// Refusée, la présentation est supprimée : on ne garde pas ce qu'on ne fera pas entendre.
export async function decideVoice(userId, approved) {
  const user = await store.getUser(userId);
  if (!user?.voix) return; // retirée entre-temps
  if (approved) {
    await store.setVoice(userId, 'approved', user.voix.duree);
    await notify(userId, 'Ta présentation vocale est validée : les autres peuvent l\'écouter.', {}, { label: 'Voir mon profil', params: { screen: 'me' } });
  } else {
    await store.removeVoice(userId);
    await notify(userId, "Ta présentation vocale a été refusée : coordonnées, demande d'argent, ou contenu inadapté. Elle est supprimée, tu peux en enregistrer une autre.", {}, { label: 'Ouvrir le profil', params: { screen: 'me' } });
  }
}

// La consigne d'enregistrement, dite au même endroit qu'on vienne de /voix ou du bouton de
// l'app : deux textes qui divergent, c'est une promesse qui diverge.
//
// Le geste d'abord, la consigne ensuite. Quelqu'un qui arrive ici vient de quitter la mini app :
// il cherche quoi faire, pas une explication. L'app lui a déjà dit où il allait.
async function expliquerLaVoix(ctx, lang) {
  const user = await store.getUser(ctx.from?.id);
  if (!user?.profile) return ctx.reply(t(lang, "Crée d'abord ton profil dans l'app, puis reviens enregistrer ta présentation."));
  return ctx.reply(t(lang,
    "Appuie sur le micro, en bas de cette discussion, et parle.\n\n{max} secondes au plus. Dis qui tu es et ce que tu cherches. Ne donne ni numéro, ni pseudo, ni rendez-vous : la modération l'écoute avant les autres, et la refuserait.\n\nPour la retirer plus tard : /sansvoix.",
    { max: DUREE_MAX_S }));
}

export async function decideVerification(userId, approved) {
  const user = await store.getUser(userId);
  if (!user) return;
  // Le délai de modération n'existait nulle part : verificationSentAt donne le départ, celui-ci
  // l'arrivée. C'est le chiffre qui manque le plus à l'équipe (audit/05-mesure-produit.md).
  const decideA = Date.now();
  await store.updateUser(userId, { verification: approved ? 'approved' : 'rejected', pendingGesture: null, verifDecidedAt: decideA });
  // auto est obligatoire : pendant une période où AUTO_APPROVE valait true, la décision tombe
  // trois secondes après l'envoi. Sans ce champ, la médiane du délai de modération vaudrait
  // trois secondes et l'équipe croirait son goulot d'étranglement résolu.
  mesurer('verif_decided', userId, {
    ok: approved,
    auto: config.autoApprove,
    ...(user.verificationSentAt ? { ms: decideA - user.verificationSentAt } : {}),
  });
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
    // Lien « personne de confiance » : quelqu'un vient d'ouvrir l'invitation d'un membre. On dit
    // exactement ce qu'elle recevra et ce qu'on garde d'elle, et on attend un accord explicite.
    // Rien n'est enregistré tant qu'elle n'a pas touché le bouton.
    const invitation = String(ctx.match || '').startsWith(PREFIXE) && String(ctx.match).slice(PREFIXE.length);
    if (invitation) {
      const membre = await porteurDuCode(invitation);
      if (!membre) return ctx.reply(t(lang, "Cette invitation n'est plus valable. Demande à ton amie ou ton ami de t'en envoyer une autre."));
      const prenom = membre.profile?.name || membre.firstName || '';
      return ctx.reply(
        t(lang, "{nom} te choisit comme personne de confiance sur {app}.\n\nSi tu acceptes, tu recevras un message quand {nom} part à un rendez-vous, avec le lieu et l'heure, et un autre quand {nom} arrive sur place. Tu ne verras rien d'autre : ni avec qui, ni les discussions.\n\nOn garde ton prénom et ton compte Telegram, rien de plus, et tu peux te retirer quand tu veux avec /retirer.",
          { nom: prenom, app: config.appName }),
        { reply_markup: new InlineKeyboard().text(t(lang, "J'accepte"), `conf:oui:${membre.id}`).text(t(lang, 'Non merci'), `conf:non:${membre.id}`) },
      );
    }
    // Lien venu de l'app : « Présentation vocale » y renvoie ici, faute de micro accessible
    // depuis une mini app. On enchaîne directement sur la consigne d'enregistrement.
    if (String(ctx.match || '') === 'voix') return expliquerLaVoix(ctx, lang);
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

  // Enregistrer dans Telegram plutôt que dans la mini app : voir l'en-tête de server/voix.js.
  // La personne ne quitte pas un outil qu'elle connaît, et rien ne dépend d'une permission
  // micro que les mini apps Android n'accordent pas.
  bot.command('voix', async (ctx) => {
    const lang = langueDe(await store.getUser(ctx.from?.id) || { languageCode: ctx.from?.language_code });
    await expliquerLaVoix(ctx, lang);
  });

  bot.command('sansvoix', async (ctx) => {
    const user = await store.getUser(ctx.from?.id);
    const lang = langueDe(user || { languageCode: ctx.from?.language_code });
    if (!user?.voix) return ctx.reply(t(lang, "Tu n'as pas de présentation vocale."));
    await store.removeVoice(user.id);
    await ctx.reply(t(lang, 'Ta présentation vocale est supprimée.'));
  });

  bot.on('message:voice', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const user = await store.getUser(ctx.from?.id);
    const lang = langueDe(user || { languageCode: ctx.from?.language_code });
    if (!user?.profile) return ctx.reply(t(lang, "Crée d'abord ton profil dans l'app, puis reviens enregistrer ta présentation."));
    if (user.banned) return ctx.reply(t(lang, "Ton compte a été fermé par l'équipe de {app}. Si tu penses que c'est une erreur, écris /aide.", { app: config.appName }));

    const refus = refusDuree(ctx.message.voice?.duration);
    if (refus) return ctx.reply(t(lang, refus.cle, refus.vars));

    const attente = await consommer(user.id, 'voix');
    if (attente) return ctx.reply(t(lang, 'Trop de présentations envoyées. Réessaie dans un moment.'));

    const dest = path.join(config.uploadsDir, fichierVoix(user.id));
    try {
      const fichier = await ctx.api.getFile(ctx.message.voice.file_id);
      // L'adresse porte le jeton du bot : elle ne doit jamais être journalisée.
      const reponse = await fetch(`https://api.telegram.org/file/bot${config.botToken}/${fichier.file_path}`);
      if (!reponse.ok) throw new Error(`réponse ${reponse.status}`);
      fs.writeFileSync(dest, Buffer.from(await reponse.arrayBuffer()));
    } catch (e) {
      console.warn(`Présentation vocale non récupérée pour ${user.id} : ${e.message}`);
      return ctx.reply(t(lang, "Le son n'est pas arrivé jusqu'à nous. Réessaie dans un moment."));
    }

    await store.setVoice(user.id, 'pending', ctx.message.voice.duration);
    // Même règle que pour le selfie et les photos : si la modération est configurée mais
    // injoignable, on défait l'envoi au lieu de laisser la personne attendre une décision que
    // personne ne peut prendre.
    if (config.adminChatId) {
      let parti = false;
      try { parti = await sendVoiceToModeration(user.id); } catch { parti = false; }
      if (!parti) {
        await store.removeVoice(user.id);
        return ctx.reply(t(lang, "La modération est injoignable pour l'instant. Ta présentation n'a pas été enregistrée, réessaie plus tard."));
      }
    } else {
      // Sans modération configurée (développement), rien ne peut être écouté : on valide.
      await store.setVoice(user.id, 'approved', ctx.message.voice.duration);
    }
    await ctx.reply(t(lang, 'Reçue. La modération l\'écoute, et tu seras prévenu dès que ce sera fait.'));
  });

  bot.callbackQuery(/^voix:(approve|reject):(\d+)$/, async (ctx) => {
    if (String(ctx.chat?.id) !== String(config.adminChatId)) return ctx.answerCallbackQuery({ text: 'Action réservée à la modération.' });
    const [, action, userId] = ctx.match;
    await decideVoice(userId, action === 'approve');
    // Le vocal est retiré du groupe et remplacé par une ligne de texte : la trace de la décision
    // reste, le son ne traîne pas dans une discussion Telegram.
    await ctx.deleteMessage().catch(() => {});
    await ctx.api.sendMessage(config.adminChatId, `Présentation vocale de ${userId} : ${action === 'approve' ? 'validée' : 'refusée'}.`, { reply_markup: boutonBannir(userId) });
    await ctx.answerCallbackQuery({ text: action === 'approve' ? 'Validée' : 'Refusée' });
  });

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

  bot.callbackQuery(/^conf:(oui|non):(\d+)$/, async (ctx) => {
    const [, reponse, membreId] = ctx.match;
    const membre = await store.getUser(membreId);
    const lang = langueDe({ languageCode: ctx.from?.language_code });
    if (!membre) return ctx.answerCallbackQuery({ text: t(lang, "Ce compte n'existe plus.") });
    // Une invitation transférée à plusieurs personnes laisse plusieurs boutons vivants : le
    // premier qui répond consomme le code, et les autres boutons ne valent plus rien. Sans ce
    // contrôle, le dernier à toucher remplacerait silencieusement celui qui avait déjà accepté.
    if (!membre.confianceCode) return ctx.answerCallbackQuery({ text: t(lang, "Cette invitation n'est plus valable.") });
    // Se désigner soi-même ne protège de rien, et ferait croire à un filet qui n'existe pas.
    if (String(ctx.from.id) === String(membre.id)) return ctx.answerCallbackQuery({ text: t(lang, 'Choisis quelqu\'un d\'autre que toi.') });
    if (reponse === 'non') {
      await refuser(membre.id);
      await ctx.editMessageText(t(lang, "C'est noté, rien n'a été enregistré."));
      return ctx.answerCallbackQuery();
    }
    await accepter(membre, ctx.from);
    await ctx.editMessageText(t(lang, "C'est fait. Tu seras prévenu quand {nom} part à un rendez-vous. Pour te retirer : /retirer.", { nom: membre.profile?.name || membre.firstName || '' }));
    // Le membre apprend que c'est accepté : sans ça, il ne saurait jamais si son filet existe.
    await notify(membre.id, '{nom} a accepté d\'être ta personne de confiance.', { nom: ctx.from.first_name || '' }, { label: 'Voir mon profil', params: { screen: 'me' } });
    await ctx.answerCallbackQuery();
  });

  // Se retirer. Elle a accepté, elle doit pouvoir revenir dessus sans passer par quelqu'un d'autre.
  bot.command('retirer', async (ctx) => {
    const lang = langueDe(await store.getUser(ctx.from?.id) || { languageCode: ctx.from?.language_code });
    const membres = await membresQuiMOntChoisi(ctx.from.id);
    if (!membres.length) return ctx.reply(t(lang, "Personne ne t'a choisi comme personne de confiance."));
    for (const m of membres) {
      await retirer(m.id);
      await notify(m.id, "{nom} ne souhaite plus être ta personne de confiance. Tu peux en désigner une autre.", { nom: ctx.from.first_name || '' }, { label: 'Voir mon profil', params: { screen: 'me' } });
    }
    await ctx.reply(t(lang, "C'est fait, tu ne recevras plus rien. Ton prénom et ton compte ont été effacés."));
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

  // Le nom affiché : posé par le serveur, pour qu'un renommage de l'app ne laisse pas l'ancien
  // nom sur le bot. Comme les commandes ci-dessous, un échec ne bloque pas le démarrage.
  await alignerLeNom();

  // Purement cosmétique : un échec ici ne doit pas empêcher la pose du webhook
  await bot.api.setMyCommands([
    { command: 'start', description: `Ouvrir ${config.appName}` },
    { command: 'aide', description: 'Sécurité et aide' },
    { command: 'voix', description: 'Enregistrer ma présentation vocale' },
    { command: 'sansvoix', description: 'Supprimer ma présentation vocale' },
    { command: 'retirer', description: 'Ne plus être personne de confiance' },
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
