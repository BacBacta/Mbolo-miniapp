import fs from 'node:fs';
import path from 'node:path';
import { Bot, InlineKeyboard, InputFile } from 'grammy';
import { config, runtime } from './config.js';
import { t, langueDe, LANGUES } from './i18n.js';
import { store } from './store.js';
import { mesurer } from './mesure.js';
import { PREFIXE, porteurDuCode, accepter, refuser, retirer, membresQuiMOntChoisi } from './confiance.js';
import { refusDuree, fichierVoix } from './voix.js';
import { consommer } from './limites.js';
import { estPlus, prolonger, palier, retirer as retirerDuPass, DUREES, offre, lireChargeUtile } from './plus.js';

export const bot = config.botToken ? new Bot(config.botToken) : null;

// Construit l'adresse de la mini app avec l'écran à ouvrir (ex. ?screen=chat&match=abc)
export function appUrl(params = {}) {
  const qs = new URLSearchParams(params).toString();
  return `${config.webAppUrl}/${qs ? `?${qs}` : ''}`;
}

// Un bouton est un accessoire ; le texte est le message.
//
// **Ce que ce garde-fou a coûté avant d'exister.** Le 16 septembre 2026, le bot a cessé de
// répondre à tout le monde. Cause : un bouton `web_app` n'est accepté par Telegram que si le
// domaine de la mini app est déclaré dans BotFather. Il ne l'était pas, Telegram refusait le
// bouton — `400: BUTTON_TYPE_INVALID` — et **refusait le message entier avec lui**. `/start`
// répondait le silence, et chaque notification (match, message, « tu as plu », arrivée) mourait
// de la même façon. Vu de Telegram, le webhook était en parfaite santé : aucune erreur de
// livraison, aucune mise à jour en attente. Il a fallu lire les journaux de la machine pour
// trouver la ligne. Une case non cochée chez BotFather ressemblait à un bot mort.
//
// Désormais : si Telegram refuse le **bouton**, on renvoie le **texte seul**. Le bot reste
// utilisable même mal configuré, et l'exploitant est prévenu là où il regarde — le groupe de
// modération — plutôt que dans un journal que personne n'ouvre.
const BOUTON_REFUSE = /BUTTON_TYPE_INVALID|BUTTON_URL_INVALID|BUTTON_DATA_INVALID|WEB_APP_URL_INVALID/i;
// Une alerte par heure : la panne touche tous les envois à la fois, et inonder le groupe de
// modération d'un message par notification refusée ne dirait rien de plus.
const ALERTE_BOUTON_MS = 3600e3;
let derniereAlerteBouton = 0;

function prevenirBoutonRefuse(raison) {
  console.warn(`Bouton refusé par Telegram (${raison}) : le message est parti sans lui.`);
  if (Date.now() - derniereAlerteBouton < ALERTE_BOUTON_MS) return;
  derniereAlerteBouton = Date.now();
  // Sans await : prévenir ne doit jamais retarder ni faire échouer l'envoi qu'on vient de sauver.
  notifyAdmin(`Telegram refuse les boutons d'ouverture de l'app (${raison}).\n\nLes messages partent sans bouton. À corriger dans BotFather : /mybots, ce bot, Bot Settings, Configure Mini App, avec l'adresse ${config.webAppUrl || '(WEBAPP_URL non défini)'}.`);
}

// Envoie, et si c'est le bouton que Telegram refuse, renvoie sans lui. Toute autre erreur
// remonte telle quelle : un compte qui a bloqué le bot n'est pas un bouton invalide.
async function envoyerMessage(chatId, text, reply_markup) {
  try {
    await bot.api.sendMessage(chatId, text, { reply_markup });
    return { sent: true };
  } catch (e) {
    const raison = e.description || e.message || '';
    if (!reply_markup || !BOUTON_REFUSE.test(raison)) throw e;
    await bot.api.sendMessage(chatId, text);
    prevenirBoutonRefuse(raison);
    return { sent: true, sansBouton: true };
  }
}

// Envoie un message du bot avec un bouton qui ouvre directement le bon écran de la mini app.
// throttleKey + throttleMs évitent d'inonder l'utilisateur (ex. une notification par discussion toutes les 2 minutes).
// Renvoie { sent: true } ou { sent: false, reason }.
// Le texte arrive sous forme de clé française et de valeurs : c'est ici, au moment de l'envoi,
// qu'on sait dans quelle langue écrire, puisque c'est celle de la personne qui reçoit.
export async function notify(userId, cle, vars, button, throttleKey, throttleMs = 2 * 60 * 1000) {
  // Appelée presque toujours sans await : elle ne doit jamais rejeter. Le corps entier est donc
  // sous filet, y compris la lecture du compte et la traduction — c'est là, hors du try, qu'un
  // message inexistant faisait tomber le serveur (audit/09-revue-code.md, C1).
  try {
    return await notifierVraiment(userId, cle, vars, button, throttleKey, throttleMs);
  } catch (e) {
    console.error(`Notification impossible pour ${userId} (erreur interne) : ${e.message}`);
    return { sent: false, reason: 'ERROR', detail: e.message };
  }
}

async function notifierVraiment(userId, cle, vars, button, throttleKey, throttleMs) {
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
    return await envoyerMessage(userId, text, reply_markup);
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
  try {
    if (!bot || !chatId) return { sent: false, reason: 'NO_BOT' };
    await bot.api.sendMessage(chatId, t(langueDe({ languageCode: lang }), cle, vars));
    return { sent: true };
  } catch (e) {
    // Elle a peut-être bloqué le bot : on ne plante pas la requête d'un membre pour autant.
    console.warn(`Message à une personne de confiance impossible (${chatId}) : ${e.description || e.message}`);
    return { sent: false, reason: 'TELEGRAM_ERROR' };
  }
}

// Permet aux routes de réagir à une validation (ex. profil de démo qui « like » le nouveau membre,
// ou l'annonce d'une arrivée aux personnes que ça intéresse).
//
// **Une liste, pas une case.** C'était `approvedHook = fn` : un second abonné effaçait le premier
// **en silence**, et le seul symptôme aurait été une fonction qui cesse de marcher sans que rien
// ne le dise. Un crochet qui n'accepte qu'un client est un piège tendu au prochain qui en veut un.
const abonnesValidation = [];
export const onApproved = (fn) => { abonnesValidation.push(fn); };
// Chaque abonné est isolé : celui qui jette ne doit pas empêcher les suivants de tourner, et
// aucun ne doit couler la décision de modération qui vient de l'appeler.
const direQueValide = (userId) => abonnesValidation.forEach((fn) => {
  try {
    Promise.resolve(fn(userId)).catch((e) => console.warn(`Réaction à une validation en échec : ${e.message}`));
  } catch (e) {
    console.warn(`Réaction à une validation en échec : ${e.message}`);
  }
});

// Qui a le droit de décider : les administrateurs du groupe de modération, demandés à Telegram.
// Le cache est court exprès : quelqu'un qu'on retire des administrateurs perd l'accès dans la
// minute. C'est un cache, pas un état — le perdre au redémarrage ne coûte qu'un appel.
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

// Un bouton de décision (valider, refuser, fermer, rouvrir) n'obéit qu'à un administrateur du
// groupe, et seulement depuis le groupe. Vérifier le seul chat laissait décider tout membre du
// groupe (audit/09-revue-code.md, I13) — et ce chat est une valeur que porte la mise à jour.
async function decisionRefusee(ctx) {
  if (String(ctx.chat?.id) !== String(config.adminChatId)) {
    await ctx.answerCallbackQuery({ text: 'Action réservée à la modération.' }).catch(() => {});
    return true;
  }
  if (!(await estAdministrateur(ctx.from?.id))) {
    await ctx.answerCallbackQuery({ text: 'Action réservée aux administrateurs du groupe.' }).catch(() => {});
    return true;
  }
  return false;
}

// Une commande de modération obéit aux mêmes deux conditions qu'un bouton : venir du groupe, et
// venir d'un administrateur. Elle est répondue plutôt que silencieuse — une commande tapée dans le
// vide laisse croire à une panne — mais elle ne dit rien de plus que « pas ici ».
async function commandeRefusee(ctx) {
  if (String(ctx.chat?.id) !== String(config.adminChatId)) {
    await ctx.reply('Cette commande ne fonctionne que dans le groupe de modération.').catch(() => {});
    return true;
  }
  if (!(await estAdministrateur(ctx.from?.id))) {
    await ctx.reply('Cette commande est réservée aux administrateurs du groupe.').catch(() => {});
    return true;
  }
  return false;
}

export async function notifyAdmin(text, reply_markup) {
  try {
    if (!bot || !config.adminChatId) return;
    await bot.api.sendMessage(config.adminChatId, text, { reply_markup });
  } catch (e) {
    console.warn('Message à la modération impossible :', e.message);
  }
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
// Il ne vient pas d'APP_NAME : il vit chez Telegram, posé à la main dans BotFather. Renommer
// l'app laissait donc l'ancien nom sur le bot — c'est ce qui est arrivé au passage à Odo, et rien
// dans le dépôt ne pouvait le voir, puisque la valeur n'y est pas. La règle 12 dit que le nom ne
// s'écrit nulle part en dur ; ici c'est le serveur qui l'impose à Telegram.
//
// **Et il n'y a pas un nom, il y en a huit.** Telegram garde un nom par défaut, plus un nom
// dédié par langue, et le nom dédié masque le défaut pour qui lit dans cette langue-là. Le guide
// BotFather du dépôt demande justement d'ajouter chaque langue. Aligner le seul défaut ne se
// voyait donc pas : la fiche publique affichait bien « Odo » pendant qu'un téléphone en français
// continuait d'afficher l'ancien nom. On retire les noms dédiés au lieu d'en poser sept : un
// seul nom pour tout le monde, celui du défaut, et une langue de plus demain n'aura rien à
// rattraper. Une chaîne vide, c'est ce que l'API appelle « retirer le nom dédié ».
//
// **Seulement là où ça diffère** : Telegram limite les changements de nom, et une app qui se
// renommerait à chaque démarrage finirait par se voir refuser le changement le jour où il compte.
// Lire ne coûte rien, écrire est rare. Un échec ne couche pas le démarrage — c'est de
// l'affichage, pas une porte d'inscription.
export async function alignerLeNom() {
  if (!bot) return { ok: false, raison: 'PAS_DE_BOT' };
  const nomVoulu = config.appName;
  const change = [];
  try {
    // Le nom que voit qui n'a pas de nom dédié dans sa langue.
    const defaut = (await bot.api.getMyName()).name;
    if (defaut !== nomVoulu) {
      // Le nom se passe en argument, pas dans un objet : grammY attend setMyName(nom).
      await bot.api.setMyName(nomVoulu);
      change.push({ langue: 'défaut', avant: defaut });
    }
    // Les noms dédiés. getMyName rend le nom dédié s'il existe, sinon le défaut : une valeur qui
    // diffère prouve donc qu'un nom dédié masque le défaut, et c'est lui qu'on retire.
    for (const langue of LANGUES) {
      const dedie = (await bot.api.getMyName({ language_code: langue })).name;
      if (dedie === nomVoulu) continue;
      await bot.api.setMyName('', { language_code: langue });
      change.push({ langue, avant: dedie });
    }
    if (change.length) {
      console.log(`Nom du bot aligné sur APP_NAME (« ${nomVoulu} ») : ${change.map((c) => `${c.langue} était « ${c.avant} »`).join(', ')}.`);
    }
    return { ok: true, change: change.length > 0, nom: nomVoulu, details: change };
  } catch (e) {
    const detail = e.description || e.message;
    console.warn([
      `Nom du bot non aligné sur APP_NAME (${detail}).`,
      `Telegram peut continuer d'afficher l'ancien nom, y compris pour une seule langue.`,
      `À corriger dans BotFather : /mybots, ton bot, Edit Bot, Edit Name — « ${nomVoulu} » —, en vérifiant chaque langue du menu.`,
    ].join('\n'));
    return { ok: false, raison: 'REFUSE', detail, details: change };
  }
}

export async function sendSelfieToModeration(userId) {
  const user = await store.getUser(userId);
  const file = path.join(config.uploadsDir, `${userId}-selfie.jpg`);
  if (!bot || !config.adminChatId || !fs.existsSync(file)) return false;
  const keyboard = new InlineKeyboard().text('Valider', `approve:${userId}`).text('Refuser', `reject:${userId}`);
  const envoye = await bot.api.sendPhoto(config.adminChatId, new InputFile(file), {
    caption: `Vérification de ${user.profile?.name || user.firstName}, ${user.profile?.age || '?'} ans\nGeste demandé : ${user.pendingGesture || 'deux doigts levés'}\nID : ${userId}`,
    reply_markup: keyboard,
  });
  // Le numéro du message est gardé : sans lui, un selfie purgé du disque restait dans le groupe,
  // bouton « Valider » compris (audit/09-revue-code.md, I5).
  if (envoye?.message_id) await store.updateUser(userId, { verifMessageId: envoye.message_id });
  return true;
}

// Décision de modération : le selfie est supprimé dans tous les cas, comme promis à l'utilisateur.
// Chaque photo de profil passe par la même modération que le selfie, avec ses propres boutons
export async function sendPhotoToModeration(userId, n) {
  const user = await store.getUser(userId);
  // L'image entière, jamais la miniature : c'est elle que l'humain valide, et la miniature en
  // est tirée sur le serveur (photos.js).
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
  // La durée annoncée est **celle de cette personne**, pas la borne du produit : quelqu'un avec un
  // pass à qui l'on dirait « quinze secondes » enregistrerait court pour rien, et l'inverse ferait
  // refuser ce qu'on vient de lui promettre.
  return ctx.reply(t(lang,
    "Appuie sur le micro, en bas de cette discussion, et parle.\n\n{max} secondes au plus. Dis qui tu es et ce que tu cherches. Ne donne ni numéro, ni pseudo, ni rendez-vous : la modération l'écoute avant les autres, et la refuserait.\n\nPour la retirer plus tard : /sansvoix.",
    { max: palier('voixSecondes', user) }));
}

export async function decideVerification(userId, approved) {
  const user = await store.getUser(userId);
  if (!user) return { ok: false, raison: 'INCONNU' };
  // Seul un selfie en attente se tranche. Sans ce contrôle, le bouton d'un vieux message — selfie
  // purgé depuis, ou déjà tranché — validait le compte sur un selfie que personne n'avait vu.
  if (user.verification !== 'pending') return { ok: false, raison: 'PAS_EN_ATTENTE' };
  // Le délai de modération n'existait nulle part : verificationSentAt donne le départ, celui-ci
  // l'arrivée. C'est le chiffre qui manque le plus à l'équipe (audit/05-mesure-produit.md).
  const decideA = Date.now();
  await store.updateUser(userId, { verification: approved ? 'approved' : 'rejected', pendingGesture: null, verifDecidedAt: decideA, verifMessageId: null });
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
    direQueValide(userId);
    await notify(userId, 'Ton profil est vérifié. Ton badge est visible, tu peux découvrir des profils.', null, { label: 'Voir des profils', params: { screen: 'discover' } });
  } else {
    await notify(userId, "Ta vérification n'a pas abouti : le geste ou le visage n'était pas assez visible. Tu peux réessayer.", null, { label: 'Réessayer', params: { screen: 'verify' } });
  }
  return { ok: true };
}

// Retire du groupe un selfie qu'aucune décision ne retirera : purgé après sept jours, ou compte
// supprimé. La photo part, une ligne de texte reste. Si Telegram refuse la suppression, la légende
// est remplacée et les boutons disparaissent avec elle — c'est le bouton qui était dangereux.
export async function retirerSelfieDuGroupe(messageId, trace) {
  if (!bot || !config.adminChatId || !messageId) return false;
  try {
    await bot.api.deleteMessage(config.adminChatId, messageId);
    await bot.api.sendMessage(config.adminChatId, trace).catch(() => {});
    return true;
  } catch {
    await bot.api.editMessageCaption(config.adminChatId, messageId, { caption: trace }).catch(() => {});
    return false;
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
        // Le bouton porte le code, pas l'identifiant du membre : Telegram ne garantit pas qu'une
        // donnée de bouton corresponde à un bouton existant, et avec l'identifiant n'importe qui
        // pouvait accepter à la place de qui a reçu le lien (audit/09-revue-code.md, I14).
        { reply_markup: new InlineKeyboard().text(t(lang, "J'accepte"), `conf:oui:${invitation}`).text(t(lang, 'Non merci'), `conf:non:${invitation}`) },
      );
    }
    // Lien venu de l'app : « Présentation vocale » y renvoie ici, faute de micro accessible
    // depuis une mini app. On enchaîne directement sur la consigne d'enregistrement.
    if (String(ctx.match || '') === 'voix') return expliquerLaVoix(ctx, lang);
    const text = t(lang, "Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans rien te faire payer pour ça.\n\nRéservé aux 18 ans et plus.", { nom: ctx.from?.first_name || '', app: config.appName });
    const reply_markup = config.webAppUrl ? new InlineKeyboard().webApp(t(lang, 'Ouvrir {app}', { app: config.appName }), appUrl()) : undefined;
    // Pas ctx.reply : c'est envoyerMessage qui sait renvoyer le texte seul si Telegram refuse le
    // bouton. Sans ça, une case non cochée dans BotFather rend le bot muet à /start.
    await envoyerMessage(ctx.chat.id, text, reply_markup);
  });

  // Permet de connaître l'identifiant de la discussion à mettre dans ADMIN_CHAT_ID
  bot.command('id', async (ctx) => ctx.reply(t(langueDe(await store.getUser(ctx.from?.id)), 'Identifiant de cette discussion : {id}', { id: ctx.chat.id })));

  bot.command('aide', async (ctx) =>
    ctx.reply(t(langueDe((await store.getUser(ctx.from?.id)) || { languageCode: ctx.from?.language_code }),
      "{app} ne te demandera jamais d'argent par message. Si quelqu'un le fait, même en son nom, c'est une arnaque : signale-le depuis la discussion dans l'app.\n\nPour supprimer ton compte : Paramètres dans l'app, puis « Supprimer mon compte ».",
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

    const refus = refusDuree(ctx.message.voice?.duration, palier('voixSecondes', user));
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
    if (await decisionRefusee(ctx)) return;
    const [, action, userId] = ctx.match;
    await decideVoice(userId, action === 'approve');
    // Le vocal est retiré du groupe et remplacé par une ligne de texte : la trace de la décision
    // reste, le son ne traîne pas dans une discussion Telegram.
    await ctx.deleteMessage().catch(() => {});
    await ctx.api.sendMessage(config.adminChatId, `Présentation vocale de ${userId} : ${action === 'approve' ? 'validée' : 'refusée'}.`, { reply_markup: boutonBannir(userId) });
    await ctx.answerCallbackQuery({ text: action === 'approve' ? 'Validée' : 'Refusée' });
  });

  bot.callbackQuery(/^(approve|reject):(.+)$/, async (ctx) => {
    if (await decisionRefusee(ctx)) return;
    const [, action, userId] = ctx.match;
    const decision = await decideVerification(userId, action === 'approve');
    if (!decision.ok) {
      // Un bouton resté vivant sous un selfie qui n'est plus en attente : on l'enlève, sans rien
      // changer au compte. Le selfie visé n'est peut-être plus celui que la personne a envoyé.
      await effacerEtTracer(ctx, `Ce selfie n'était plus en attente (déjà tranché, expiré ou compte supprimé) : rien n'a été changé (ID ${userId}).`);
      return ctx.answerCallbackQuery({ text: 'Déjà tranché ou expiré : rien n\'a changé.' });
    }
    // Le selfie est supprimé du disque ET du groupe : une légende modifiée laissait l'image
    // visible indéfiniment dans Telegram, ce que la promesse faite à la personne exclut.
    await effacerEtTracer(ctx, `Vérification ${action === 'approve' ? 'validée' : 'refusée'} par ${ctx.from.first_name} (ID ${userId})`);
    await ctx.answerCallbackQuery({ text: action === 'approve' ? 'Profil validé' : 'Profil refusé' });
  });

  // Fermer un compte, et rouvrir en cas d'erreur. Réservé au groupe de modération, comme les
  // deux décisions au-dessus : le compte fermé perd l'accès à l'API et disparaît de la découverte,
  // ses matchs sont défaits, et la trace dit qui a décidé, quand et pourquoi.
  bot.callbackQuery(/^ban:(\d+)$/, async (ctx) => {
    if (await decisionRefusee(ctx)) return;
    const userId = ctx.match[1];
    const u = await store.banUser(userId, { motif: 'décision de la modération', par: ctx.from.first_name });
    if (!u) return ctx.answerCallbackQuery({ text: 'Ce compte n\'existe plus.' });
    await ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard().text('Rouvrir ce compte', `unban:${userId}`) }).catch(() => {});
    await ctx.api.sendMessage(config.adminChatId, `Compte fermé par ${ctx.from.first_name} (ID ${userId})`).catch(() => {});
    await ctx.answerCallbackQuery({ text: 'Compte fermé' });
  });

  bot.callbackQuery(/^unban:(\d+)$/, async (ctx) => {
    if (await decisionRefusee(ctx)) return;
    const userId = ctx.match[1];
    const u = await store.unbanUser(userId);
    if (!u) return ctx.answerCallbackQuery({ text: 'Ce compte n\'existe plus.' });
    await ctx.editMessageReplyMarkup({ reply_markup: boutonBannir(userId) }).catch(() => {});
    await ctx.api.sendMessage(config.adminChatId, `Compte rouvert par ${ctx.from.first_name} (ID ${userId})`).catch(() => {});
    await ctx.answerCallbackQuery({ text: 'Compte rouvert' });
  });

  // Offrir un pass Odo Plus à la main, depuis le groupe de modération. Il n'y a pas encore de
  // caisse (P0-6) et c'est volontaire : avant de faire payer quoi que ce soit, il faut savoir si
  // ce qu'il y a derrière change quelque chose pour de vrais membres. Un pass offert le dit, et
  // ne demande ni agrégateur ni remboursement.
  //
  // La personne est prévenue des deux côtés : recevoir un droit sans le savoir ne sert à rien, et
  // le voir disparaître sans explication est pire.
  bot.command('pass', async (ctx) => {
    if (await commandeRefusee(ctx)) return;
    const [id, jours] = String(ctx.match || '').trim().split(/\s+/);
    if (!/^\d+$/.test(id || '')) return ctx.reply('Usage : /pass <identifiant> <jours>. Exemple : /pass 123456789 30. Pour retirer : /sanspass <identifiant>.');
    const u = await store.getUser(id);
    if (!u) return ctx.reply(`Aucun compte avec l'identifiant ${id}.`);
    let plus;
    try {
      plus = prolonger(u, { jours: Number(jours || 30), source: 'gift' });
    } catch (e) {
      return ctx.reply(`${e.message} Les durées vendues sont ${DUREES.join(' et ')} jours.`);
    }
    await store.updateUser(u.id, { plus });
    // Un pass posé se compte : sans caisse, c'est la seule trace de ce qu'on a distribué, et
    // sans elle on ne saurait pas dire sur combien de membres la mesure d'usage porte.
    mesurer('pass_pose', u.id, { jours: Number(jours || 30) });
    // Deux lectrices, deux formats : la modération lit en français, la personne dans sa langue.
    // Une phrase traduite qui porte une date en français ne serait traduite qu'à moitié.
    const quand = (lang) => new Date(plus.finLe).toLocaleDateString(lang, { dateStyle: 'long', timeZone: config.modTimezone });
    await ctx.reply(`Pass ${config.appName} Plus posé sur ${id} jusqu'au ${quand('fr-FR')} (offert par ${ctx.from.first_name}).`);
    notify(u.id, 'Ton pass {app} Plus est actif jusqu\'au {date}.', { app: config.appName, date: quand(langueDe(u)) }, { label: 'Voir mon profil', params: { screen: 'me' } });
  });

  // Pourquoi A ne voit pas B dans son paquet. Réservé au groupe de modération : la réponse nomme
  // la ville, l'intention et l'âge de deux membres, ce que la file de vérification ne montre pas.
  // La règle vit dans routes.js (pourquoiPas), à côté du paquet qu'elle explique.
  //
  // L'import est différé parce que routes.js importe déjà ce fichier (notify, onApproved…) : un
  // import statique dans l'autre sens ferait un cycle, qui marche en ESM tant que l'ordre
  // d'évaluation ne bouge pas — c'est-à-dire jusqu'au jour où il bouge.
  bot.command('pourquoi', async (ctx) => {
    if (await commandeRefusee(ctx)) return;
    const [idA, idB] = String(ctx.match || '').trim().split(/\s+/);
    if (!/^\d+$/.test(idA || '') || !/^\d+$/.test(idB || '')) return ctx.reply('Usage : /pourquoi <identifiant A> <identifiant B> — est-ce que A verrait B dans son paquet, et sinon quelle porte ferme.');
    const { expliquerLaDecouverte } = await import('./routes.js');
    const r = await expliquerLaDecouverte(idA, idB);
    if (r.manque) return ctx.reply(`Aucun compte avec l'identifiant ${r.manque}.`);
    if (r.sansProfil) return ctx.reply(`${r.sansProfil} n'a pas encore de profil : il ne voit personne, et personne ne le voit.`);
    const lignes = r.portes.map((p) => `${p.ok ? '✓' : '✗'} ${p.porte}${p.detail ? ` — ${p.detail}` : ''}`);
    const fermees = r.portes.filter((p) => !p.ok).map((p) => p.porte);
    const verdict = r.verrait ? `${idA} verrait ${idB} dans son paquet.` : `${idA} ne voit pas ${idB} : ${fermees.join(', ')}.`;
    await ctx.reply(`${verdict}\n\n${lignes.join('\n')}`);
  });

  // ---------- La caisse : Telegram Stars ----------
  //
  // Telegram pose deux questions au bot. D'abord, juste avant de débiter : « ce paiement est-il
  // encore bon ? » (pre_checkout_query, dix secondes pour répondre). On relit la charge utile de
  // la facture, on vérifie que la durée est toujours vendue **à ce prix** — la grille a pu changer
  // entre la facture et le paiement — et que la devise est bien XTR. Ensuite, une fois débité :
  // « voilà le paiement » (successful_payment). C'est là, et seulement là, que le pass se pose.
  //
  // Le pass va à **qui a payé** (ctx.from), pas à l'identifiant écrit dans la facture : une
  // adresse de facture peut être transmise, et l'argent est sorti du compte de qui l'a ouverte.
  // La ligne de paiement porte la référence Telegram, unique : un webhook rejoué rend la ligne
  // déjà écrite et ne crédite pas deux fois.
  bot.on('pre_checkout_query', async (ctx) => {
    const q = ctx.preCheckoutQuery;
    const charge = lireChargeUtile(q.invoice_payload);
    const o = charge && offre(charge.jours);
    if (!o) return ctx.answerPreCheckoutQuery(false, { error_message: 'Cette offre n\'existe plus. Rouvre l\'app et choisis une durée.' });
    if (q.currency !== 'XTR' || Number(q.total_amount) !== o.stars) return ctx.answerPreCheckoutQuery(false, { error_message: 'Le prix a changé depuis cette facture. Rouvre l\'app pour en refaire une.' });
    const u = await store.getUser(ctx.from.id);
    if (!u || u.banned) return ctx.answerPreCheckoutQuery(false, { error_message: 'Ce compte ne peut pas prendre de pass.' });
    await ctx.answerPreCheckoutQuery(true);
  });

  bot.on('message:successful_payment', async (ctx) => {
    const p = ctx.message.successful_payment;
    const charge = lireChargeUtile(p.invoice_payload);
    const u = await store.getUser(ctx.from.id);
    if (!charge || !offre(charge.jours) || !u) {
      // De l'argent est sorti et on ne sait pas quoi en faire : ça se voit tout de suite dans
      // le groupe, avec la référence pour rembourser.
      await notifyAdmin(`Paiement reçu sans pass possible (charge utile « ${p.invoice_payload} », ${p.total_amount} Stars, compte ${ctx.from.id}). Référence : ${p.telegram_payment_charge_id}. À rembourser : /rembourser ${p.telegram_payment_charge_id}`);
      return;
    }
    const ligne = await store.addPaiement({ userId: u.id, chargeId: p.telegram_payment_charge_id, source: 'stars', jours: charge.jours, stars: Number(p.total_amount) });
    if (ligne.deja) return; // livraison rejouée : déjà crédité
    const plus = prolonger(u, { jours: charge.jours, source: 'stars' });
    await store.updateUser(u.id, { plus });
    mesurer('pass_achat', u.id, { jours: charge.jours, stars: Number(p.total_amount) });
    const quand = (lang) => new Date(plus.finLe).toLocaleDateString(lang, { dateStyle: 'long', timeZone: config.modTimezone });
    await notify(u.id, 'Merci. Ton pass {app} Plus est actif jusqu\'au {date}. Reçu : {ref}', { app: config.appName, date: quand(langueDe(u)), ref: p.telegram_payment_charge_id.slice(-6) }, { label: 'Ouvrir {app}', params: { screen: 'me' } });
    notifyAdmin(`Pass ${charge.jours} j acheté (${p.total_amount} Stars) par ${u.id}, jusqu'au ${quand('fr-FR')}. Référence : ${p.telegram_payment_charge_id}`);
  });

  // Rembourser un paiement en Stars, depuis le groupe de modération, par sa référence (celle du
  // reçu envoyé à la personne, ou de la ligne du groupe). Telegram rend les Stars ; les jours
  // achetés sont retirés du pass, jamais en dessous d'aujourd'hui.
  bot.command('rembourser', async (ctx) => {
    if (await commandeRefusee(ctx)) return;
    const ref = String(ctx.match || '').trim();
    if (!ref) return ctx.reply('Usage : /rembourser <référence du paiement>. La référence est sur le reçu de la personne et dans la ligne du groupe.');
    const paiement = await store.paiementParCharge(ref);
    if (!paiement) return ctx.reply(`Aucun paiement avec la référence ${ref}.`);
    if (paiement.statut === 'rembourse') return ctx.reply('Ce paiement a déjà été remboursé.');
    if (!paiement.userId) return ctx.reply('Ce paiement appartient à un compte supprimé : Telegram ne peut plus le rembourser par ce chemin.');
    try {
      await bot.api.refundStarPayment(Number(paiement.userId), paiement.chargeId);
    } catch (e) {
      return ctx.reply(`Telegram a refusé le remboursement : ${e.message}`);
    }
    await store.marquerRembourse(paiement.chargeId);
    const u = await store.getUser(paiement.userId);
    if (u) await store.updateUser(u.id, { plus: retirerDuPass(u, paiement.jours) });
    mesurer('pass_rembourse', paiement.userId, { jours: paiement.jours });
    await ctx.reply(`Remboursé : ${paiement.stars} Stars à ${paiement.userId} (${paiement.jours} jours retirés).`);
    if (u) notify(u.id, 'Ton paiement de {n} Stars a été remboursé. Les jours correspondants sont retirés de ton pass.', { n: paiement.stars }, { label: 'Voir mon profil', params: { screen: 'me' } });
  });

  // Telegram demande à tout bot qui encaisse de répondre à /paysupport. La personne y trouve ses
  // reçus et le chemin vers l'équipe : ce qu'elle écrit après /aidepaiement est transmis au
  // groupe de modération, avec son identifiant, jamais avec son pseudo.
  bot.command('paysupport', async (ctx) => {
    const u = await store.getUser(ctx.from?.id);
    const achats = u ? await store.paiementsDe(u.id) : [];
    const lignes = achats.slice(0, 5).map((p) => `• ${new Date(p.at).toLocaleDateString(langueDe(u), { dateStyle: 'medium', timeZone: config.modTimezone })} · ${p.jours} j · ${p.stars} Stars · ${p.statut === 'rembourse' ? t(langueDe(u), 'remboursé') : t(langueDe(u), 'reçu {ref}', { ref: p.chargeId.slice(-6) })}`);
    await ctx.reply(`${t(langueDe(u), 'Tes paiements {app} Plus :', { app: config.appName })}\n${lignes.length ? lignes.join('\n') : t(langueDe(u), 'Aucun paiement pour l\'instant.')}\n\n${t(langueDe(u), 'Un problème avec un paiement ? Écris /aidepaiement suivi de ton message : l\'équipe te répond ici.')}`);
  });
  bot.command('aidepaiement', async (ctx) => {
    const texte = String(ctx.match || '').trim().slice(0, 500);
    const u = await store.getUser(ctx.from?.id);
    if (!texte) return ctx.reply(t(langueDe(u), 'Écris ton message après /aidepaiement, en une ligne.'));
    await notifyAdmin(`Aide paiement demandée par ${ctx.from.id} : ${texte}`);
    await ctx.reply(t(langueDe(u), 'Transmis à l\'équipe. Elle te répond ici.'));
  });

  bot.command('sanspass', async (ctx) => {
    if (await commandeRefusee(ctx)) return;
    const id = String(ctx.match || '').trim();
    if (!/^\d+$/.test(id)) return ctx.reply('Usage : /sanspass <identifiant>.');
    const u = await store.getUser(id);
    if (!u) return ctx.reply(`Aucun compte avec l'identifiant ${id}.`);
    if (!estPlus(u)) return ctx.reply(`${id} n'a pas de pass en cours : rien n'a été changé.`);
    await store.updateUser(u.id, { plus: null });
    mesurer('pass_retire', u.id);
    await ctx.reply(`Pass retiré à ${id} par ${ctx.from.first_name}.`);
    notify(u.id, 'Ton pass {app} Plus a été retiré.', { app: config.appName }, { label: 'Voir mon profil', params: { screen: 'me' } });
  });

  // Six emplacements depuis que le pass en ouvre six : un bouton posé sur la photo 4 et refusé
  // ici aurait laissé une photo en attente que personne ne pouvait trancher.
  bot.callbackQuery(/^photo:(approve|reject):(\d+):([1-6])$/, async (ctx) => {
    if (await decisionRefusee(ctx)) return;
    const [, action, userId, n] = ctx.match;
    await decidePhoto(userId, Number(n), action === 'approve');
    await effacerEtTracer(ctx, `Photo ${n} ${action === 'approve' ? 'validée' : 'refusée'} par ${ctx.from.first_name} (ID ${userId})`);
    await ctx.answerCallbackQuery({ text: action === 'approve' ? 'Photo validée' : 'Photo refusée' });
  });

  bot.callbackQuery(/^conf:(oui|non):([A-Za-z0-9_-]{1,40})$/, async (ctx) => {
    const [, reponse, code] = ctx.match;
    const lang = langueDe({ languageCode: ctx.from?.language_code });
    // Le code seul retrouve le membre : il est aléatoire, à usage unique et périmable. Une
    // invitation transférée à plusieurs personnes laisse plusieurs boutons vivants : le premier
    // qui répond consomme le code, et les autres boutons ne valent plus rien. Un code inconnu
    // et un compte disparu se répondent pareil, pour ne pas dire qui est inscrit.
    const membre = await porteurDuCode(code);
    if (!membre) return ctx.answerCallbackQuery({ text: t(lang, "Cette invitation n'est plus valable.") });
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

  bot.catch(signalerErreurDuBot);
}

// bot.catch ne sert qu'à l'interrogation longue : en mode webhook, grammY relance l'erreur au
// lieu de l'y passer, et Express 4 ignore la promesse rejetée — le processus s'arrêtait sur un
// ctx.reply refusé par Telegram (audit/09-revue-code.md, C5). Le webhook journalise donc par le
// même chemin, et répond 200 : Telegram renverrait sinon la même mise à jour en boucle.
const signalerErreurDuBot = (err) => console.error('Erreur du bot :', err?.error?.message || err?.message || err);
export const WEBHOOK_PATH = '/telegram/webhook';
export function routeWebhook(webhookCallback) {
  // secretToken : grammY compare l'en-tête X-Telegram-Bot-Api-Secret-Token à temps constant et
  // répond 401 sans rien traiter s'il manque ou diffère. Sans lui, qui connaissait le chemin
  // forgeait une mise à jour — un bouton « Valider » venu de ADMIN_CHAT_ID, par exemple.
  const wh = webhookCallback(bot, 'express', { onTimeout: 'return', timeoutMilliseconds: WEBHOOK_TIMEOUT_MS, secretToken: config.webhookSecret });
  return (req, res) => Promise.resolve(wh(req, res)).catch((err) => {
    signalerErreurDuBot(err);
    if (!res.headersSent) res.status(200).end();
  });
}
// Telegram attend une réponse ; au-delà, on la donne et le traitement continue en arrière-plan.
export const WEBHOOK_TIMEOUT_MS = 25_000;

// Telegram refuse parfois le webhook pour une cause passagère : nom de domaine pas encore
// résolu après l'allocation d'une adresse publique, coupure réseau au démarrage. Sans reprise,
// le bot restait muet jusqu'au prochain redémarrage — et comme c'est l'appel du webhook qui
// réveille une machine arrêtée, l'échec s'entretenait lui-même.
export const WEBHOOK_RETRY_DELAYS_MS = [5e3, 15e3, 30e3, 60e3, 120e3, 300e3];

// Ne jette jamais : le serveur doit rester debout même si Telegram refuse.
export async function poseWebhook(url, { delais = WEBHOOK_RETRY_DELAYS_MS } = {}) {
  for (let essai = 0; ; essai += 1) {
    try {
      // secret_token : Telegram le renvoie dans l'en-tête X-Telegram-Bot-Api-Secret-Token, et
      // routeWebhook refuse tout appel qui ne le porte pas. C'est lui qui authentifie, pas
      // l'adresse — qui voyage dans les journaux (audit/09-revue-code.md, C4).
      await bot.api.setWebhook(url, { secret_token: config.webhookSecret });
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
    // Plus de secret dans le chemin : ADMIN_KEY y voyageait, donc dans les journaux de requêtes,
    // et un chemin ne prouve rien. L'authenticité vient de l'en-tête (voir routeWebhook).
    const secretPath = WEBHOOK_PATH;
    app.use(secretPath, routeWebhook(webhookCallback));
    // Sans await : le serveur répond tout de suite, la reprise se poursuit en arrière-plan
    poseWebhook(`${config.webAppUrl}${secretPath}`, delais ? { delais } : {});
  } else {
    await bot.api.deleteWebhook();
    bot.start({ onStart: (me) => console.log(`Bot @${me.username} démarré (interrogation longue)`) });
  }
}
