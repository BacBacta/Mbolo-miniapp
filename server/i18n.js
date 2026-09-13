// Traduction côté serveur. Elle ne sert qu'aux messages que le bot envoie dans Telegram :
// l'interface, elle, traduit chez la personne (public/i18n.js), et les erreurs de l'API sont
// traduites par leur code. Le serveur n'a donc à connaître qu'une quarantaine de phrases.
//
// Même principe que côté navigateur : la clé est la phrase française, une clé manquante retombe
// sur du français lisible.
//
// Le russe et l'ukrainien tutoient comme le français (ты, ти) et suivent la même règle de casse :
// une majuscule au début de la phrase, pas à chaque mot. Les tournures qui accorderaient le genre
// du destinataire sont évitées — le bot ne connaît pas le genre de qui reçoit.

export const LANGUES = ['fr', 'en', 'ru', 'uk'];
export const LANGUE_SOURCE = 'fr';

const EN = {
  // Bot
  'Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans jamais te demander d\'argent.\n\nRéservé aux 18 ans et plus.':
    'Hi {nom}. {app} introduces you to verified people near you, and never asks you for money.\n\nFor ages 18 and over.',
  'Ouvrir {app}': 'Open {app}',
  '{app} ne te demandera jamais d\'argent. Si quelqu\'un le fait, signale-le depuis la discussion dans l\'app.\n\nPour supprimer ton compte : Paramètres dans l\'app, puis « Supprimer mon compte ».':
    '{app} will never ask you for money. If someone does, report them from the chat in the app.\n\nTo delete your account: Settings in the app, then "Delete my account".',
  'Identifiant de cette discussion : {id}': 'Chat ID: {id}',
  // Personne de confiance
  "{nom} te choisit comme personne de confiance sur {app}.\n\nSi tu acceptes, tu recevras un message quand {nom} part à un rendez-vous, avec le lieu et l'heure, et un autre quand {nom} arrive sur place. Tu ne verras rien d'autre : ni avec qui, ni les discussions.\n\nOn garde ton prénom et ton compte Telegram, rien de plus, et tu peux te retirer quand tu veux avec /retirer.":
    "{nom} has chosen you as their trusted contact on {app}.\n\nIf you accept, you will get a message when {nom} leaves for a date, with the place and time, and another one when {nom} arrives. You will see nothing else: not who with, not the conversations.\n\nWe keep your first name and your Telegram account, nothing more, and you can withdraw at any time with /retirer.",
  "J'accepte": 'I accept',
  'Non merci': 'No thanks',
  "Cette invitation n'est plus valable. Demande à ton amie ou ton ami de t'en envoyer une autre.":
    'This invitation is no longer valid. Ask your friend to send you another one.',
  "Cette invitation n'est plus valable.": 'This invitation is no longer valid.',
  "Choisis quelqu'un d'autre que toi.": 'Choose someone other than yourself.',
  "Ce compte n'existe plus.": 'This account no longer exists.',
  "C'est noté, rien n'a été enregistré.": 'Noted, nothing has been saved.',
  "C'est fait. Tu seras prévenu quand {nom} part à un rendez-vous. Pour te retirer : /retirer.":
    'Done. You will be told when {nom} leaves for a date. To withdraw: /retirer.',
  "{nom} a accepté d'être ta personne de confiance.": '{nom} agreed to be your trusted contact.',
  'Voir mon profil': 'See my profile',
  "Personne ne t'a choisi comme personne de confiance.": 'Nobody has chosen you as their trusted contact.',
  "{nom} ne souhaite plus être ta personne de confiance. Tu peux en désigner une autre.":
    '{nom} no longer wishes to be your trusted contact. You can choose someone else.',
  "C'est fait, tu ne recevras plus rien. Ton prénom et ton compte ont été effacés.":
    'Done, you will not receive anything else. Your first name and your account have been erased.',
  "{nom} ne t'a plus comme personne de confiance. Tu ne recevras plus rien.":
    '{nom} no longer has you as their trusted contact. You will not receive anything else.',
  "{nom} te prévient : elle ou il part à un rendez-vous maintenant. Tu es sa personne de confiance.":
    '{nom} is letting you know: they are leaving for a date now. You are their trusted contact.',
  '{nom} a un rendez-vous : {lieu}, {creneau}. Tu es sa personne de confiance.':
    '{nom} has a date: {lieu}, {creneau}. You are their trusted contact.',
  // Vérification et photos
  'Ton profil est vérifié. Ton badge est visible, tu peux découvrir des profils.':
    'Your profile is verified. Your badge is visible and you can start browsing.',
  'Voir des profils': 'Browse profiles',
  "Ta vérification n'a pas abouti : le geste ou le visage n'était pas assez visible. Tu peux réessayer.":
    'Your verification did not go through: the gesture or your face was not clear enough. You can try again.',
  'Réessayer': 'Try again',
  'Ta photo {n} est validée : les autres la voient maintenant.': 'Your photo {n} is approved: others can see it now.',
  'Voir mon profil': 'View my profile',
  "Ta photo {n} a été refusée : visage peu visible, contenu inadapté, ou ce n'est pas toi. Elle est supprimée, tu peux en mettre une autre.":
    'Your photo {n} was rejected: face not clearly visible, unsuitable content, or not you. It has been deleted, you can upload another one.',
  'Changer de photo': 'Change photo',
  // Notifications de l'app
  'Les notifications {app} fonctionnent. Tu seras prévenu(e) ici des matchs et des messages.':
    '{app} notifications are working. Matches and messages will reach you here.',
  'Nouveau match : {nom} et toi, vous vous plaisez.': 'New match: {nom} and you like each other.',
  'Écrire': 'Write',
  "Tu as plu à quelqu'un à {ville}. Ouvre {app} pour découvrir de qui il s'agit.":
    'Someone in {ville} likes your profile. Open {app} to find out who.',
  'Découvrir': 'Discover',
  "{nom} t'a écrit : « {extrait} »": '{nom} wrote to you: "{extrait}"',
  'Répondre': 'Reply',
  '{nom} te propose un rendez-vous : {lieu} ({quartier}), {creneau}.': '{nom} suggests a meet-up: {lieu} ({quartier}), {creneau}.',
  'Voir la proposition': 'View the invitation',
  '{nom} a accepté le rendez-vous : {lieu}, {creneau}.': '{nom} accepted the meet-up: {lieu}, {creneau}.',
  '{nom} ne peut pas venir à {lieu}, {creneau}. Tu peux en proposer un autre.': '{nom} cannot make it to {lieu}, {creneau}. You can suggest another one.',
  '{nom} a annulé le rendez-vous de {lieu}, {creneau}.': '{nom} cancelled the meet-up at {lieu}, {creneau}.',
  '{nom} est bien arrivé(e) à {lieu}.': '{nom} has arrived at {lieu}.',
  'Ouvrir la discussion': 'Open the chat',
};

const RU = {
  // Bot
  'Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans jamais te demander d\'argent.\n\nRéservé aux 18 ans et plus.':
    'Привет, {nom}. {app} знакомит тебя с проверенными людьми из твоего города и никогда не просит денег.\n\nТолько с 18 лет.',
  'Ouvrir {app}': 'Открыть {app}',
  '{app} ne te demandera jamais d\'argent. Si quelqu\'un le fait, signale-le depuis la discussion dans l\'app.\n\nPour supprimer ton compte : Paramètres dans l\'app, puis « Supprimer mon compte ».':
    '{app} никогда не попросит у тебя денег. Если кто-то просит, пожалуйся на него прямо из переписки в приложении.\n\nЧтобы удалить аккаунт: «Настройки» в приложении, затем «Удалить мой аккаунт».',
  'Identifiant de cette discussion : {id}': 'Идентификатор этого чата: {id}',
  // Personne de confiance
  "{nom} te choisit comme personne de confiance sur {app}.\n\nSi tu acceptes, tu recevras un message quand {nom} part à un rendez-vous, avec le lieu et l'heure, et un autre quand {nom} arrive sur place. Tu ne verras rien d'autre : ni avec qui, ni les discussions.\n\nOn garde ton prénom et ton compte Telegram, rien de plus, et tu peux te retirer quand tu veux avec /retirer.":
    '{nom} выбирает тебя доверенным лицом в {app}.\n\nЕсли ты согласишься, тебе придёт сообщение, когда {nom} отправится на встречу, с местом и временем, и ещё одно, когда {nom} придёт на место. Больше ты не увидишь ничего: ни с кем встреча, ни переписок.\n\nМы храним твоё имя и твой аккаунт Telegram, и ничего больше, а отказаться можно в любой момент командой /retirer.',
  "J'accepte": 'Принимаю',
  'Non merci': 'Нет, спасибо',
  "Cette invitation n'est plus valable. Demande à ton amie ou ton ami de t'en envoyer une autre.":
    'Это приглашение больше не действует. Попроси подругу или друга прислать тебе новое.',
  "Cette invitation n'est plus valable.": 'Это приглашение больше не действует.',
  "Choisis quelqu'un d'autre que toi.": 'Выбери кого-то, кроме себя.',
  "Ce compte n'existe plus.": 'Этого аккаунта больше нет.',
  "C'est noté, rien n'a été enregistré.": 'Принято, ничего не сохранено.',
  "C'est fait. Tu seras prévenu quand {nom} part à un rendez-vous. Pour te retirer : /retirer.":
    'Готово. Тебе придёт сообщение, когда {nom} отправится на встречу. Чтобы отказаться: /retirer.',
  "{nom} a accepté d'être ta personne de confiance.": '{nom} теперь твоё доверенное лицо.',
  'Voir mon profil': 'Открыть мою анкету',
  "Personne ne t'a choisi comme personne de confiance.": 'Никто не выбирал тебя доверенным лицом.',
  "{nom} ne souhaite plus être ta personne de confiance. Tu peux en désigner une autre.":
    '{nom} больше не хочет быть твоим доверенным лицом. Ты можешь выбрать другого человека.',
  "C'est fait, tu ne recevras plus rien. Ton prénom et ton compte ont été effacés.":
    'Готово, больше ты ничего не получишь. Твоё имя и твой аккаунт удалены.',
  "{nom} ne t'a plus comme personne de confiance. Tu ne recevras plus rien.":
    '{nom} больше не считает тебя доверенным лицом. Больше ты ничего не получишь.',
  "{nom} te prévient : elle ou il part à un rendez-vous maintenant. Tu es sa personne de confiance.":
    '{nom} предупреждает: сейчас отправляется на встречу. Ты — доверенное лицо этого человека.',
  '{nom} a un rendez-vous : {lieu}, {creneau}. Tu es sa personne de confiance.':
    'У {nom} встреча: {lieu}, {creneau}. Ты — доверенное лицо этого человека.',
  // Vérification et photos
  'Ton profil est vérifié. Ton badge est visible, tu peux découvrir des profils.':
    'Твоя анкета проверена. Значок виден, можно смотреть анкеты.',
  'Voir des profils': 'Смотреть анкеты',
  "Ta vérification n'a pas abouti : le geste ou le visage n'était pas assez visible. Tu peux réessayer.":
    'Проверка не прошла: жест или лицо было видно недостаточно чётко. Можно попробовать снова.',
  'Réessayer': 'Попробовать снова',
  'Ta photo {n} est validée : les autres la voient maintenant.': 'Твоё фото {n} одобрено: теперь его видят другие.',
  "Ta photo {n} a été refusée : visage peu visible, contenu inadapté, ou ce n'est pas toi. Elle est supprimée, tu peux en mettre une autre.":
    'Твоё фото {n} отклонено: лицо плохо видно, неподходящее содержимое или это не ты. Фото удалено, можно загрузить другое.',
  'Changer de photo': 'Заменить фото',
  // Notifications de l'app
  'Les notifications {app} fonctionnent. Tu seras prévenu(e) ici des matchs et des messages.':
    'Уведомления {app} работают. Здесь ты будешь узнавать о мэтчах и сообщениях.',
  'Nouveau match : {nom} et toi, vous vous plaisez.': 'Новый мэтч: {nom} и ты понравились друг другу.',
  'Écrire': 'Написать',
  "Tu as plu à quelqu'un à {ville}. Ouvre {app} pour découvrir de qui il s'agit.":
    'Кому-то в городе {ville} понравилась твоя анкета. Открой {app}, чтобы узнать кому.',
  'Découvrir': 'Смотреть',
  "{nom} t'a écrit : « {extrait} »": '{nom} пишет тебе: «{extrait}»',
  'Répondre': 'Ответить',
  '{nom} te propose un rendez-vous : {lieu} ({quartier}), {creneau}.': '{nom} предлагает встречу: {lieu} ({quartier}), {creneau}.',
  'Voir la proposition': 'Открыть предложение',
  '{nom} a accepté le rendez-vous : {lieu}, {creneau}.': '{nom} подтверждает встречу: {lieu}, {creneau}.',
  '{nom} ne peut pas venir à {lieu}, {creneau}. Tu peux en proposer un autre.': '{nom} не сможет прийти: {lieu}, {creneau}. Ты можешь предложить другую встречу.',
  '{nom} a annulé le rendez-vous de {lieu}, {creneau}.': '{nom} отменяет встречу: {lieu}, {creneau}.',
  '{nom} est bien arrivé(e) à {lieu}.': '{nom} на месте: {lieu}.',
  'Ouvrir la discussion': 'Открыть чат',
};

const UK = {
  // Bot
  'Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans jamais te demander d\'argent.\n\nRéservé aux 18 ans et plus.':
    'Привіт, {nom}. {app} знайомить тебе з перевіреними людьми з твого міста і ніколи не просить грошей.\n\nЛише від 18 років.',
  'Ouvrir {app}': 'Відкрити {app}',
  '{app} ne te demandera jamais d\'argent. Si quelqu\'un le fait, signale-le depuis la discussion dans l\'app.\n\nPour supprimer ton compte : Paramètres dans l\'app, puis « Supprimer mon compte ».':
    '{app} ніколи не попросить у тебе грошей. Якщо хтось просить, поскаржся на нього просто з листування в застосунку.\n\nЩоб видалити акаунт: «Налаштування» у застосунку, потім «Видалити мій акаунт».',
  'Identifiant de cette discussion : {id}': 'Ідентифікатор цього чату: {id}',
  // Personne de confiance
  "{nom} te choisit comme personne de confiance sur {app}.\n\nSi tu acceptes, tu recevras un message quand {nom} part à un rendez-vous, avec le lieu et l'heure, et un autre quand {nom} arrive sur place. Tu ne verras rien d'autre : ni avec qui, ni les discussions.\n\nOn garde ton prénom et ton compte Telegram, rien de plus, et tu peux te retirer quand tu veux avec /retirer.":
    '{nom} обирає тебе довіреною особою в {app}.\n\nЯкщо ти погодишся, тобі надійде повідомлення, коли {nom} вирушить на зустріч, з місцем і часом, і ще одне, коли {nom} прийде на місце. Більше ти не побачиш нічого: ні з ким зустріч, ні листувань.\n\nМи зберігаємо твоє імʼя і твій акаунт Telegram, і нічого більше, а відмовитися можна будь-коли командою /retirer.',
  "J'accepte": 'Приймаю',
  'Non merci': 'Ні, дякую',
  "Cette invitation n'est plus valable. Demande à ton amie ou ton ami de t'en envoyer une autre.":
    'Це запрошення більше не дійсне. Попроси подругу або друга надіслати тобі нове.',
  "Cette invitation n'est plus valable.": 'Це запрошення більше не дійсне.',
  "Choisis quelqu'un d'autre que toi.": 'Обери когось, крім себе.',
  "Ce compte n'existe plus.": 'Цього акаунта більше немає.',
  "C'est noté, rien n'a été enregistré.": 'Прийнято, нічого не збережено.',
  "C'est fait. Tu seras prévenu quand {nom} part à un rendez-vous. Pour te retirer : /retirer.":
    'Готово. Тобі надійде повідомлення, коли {nom} вирушить на зустріч. Щоб відмовитися: /retirer.',
  "{nom} a accepté d'être ta personne de confiance.": '{nom} тепер твоя довірена особа.',
  'Voir mon profil': 'Відкрити мою анкету',
  "Personne ne t'a choisi comme personne de confiance.": 'Ніхто не обирав тебе довіреною особою.',
  "{nom} ne souhaite plus être ta personne de confiance. Tu peux en désigner une autre.":
    '{nom} більше не хоче бути твоєю довіреною особою. Ти можеш обрати іншу людину.',
  "C'est fait, tu ne recevras plus rien. Ton prénom et ton compte ont été effacés.":
    'Готово, більше ти нічого не отримаєш. Твоє імʼя і твій акаунт видалені.',
  "{nom} ne t'a plus comme personne de confiance. Tu ne recevras plus rien.":
    '{nom} більше не має тебе довіреною особою. Більше ти нічого не отримаєш.',
  "{nom} te prévient : elle ou il part à un rendez-vous maintenant. Tu es sa personne de confiance.":
    '{nom} попереджає: зараз вирушає на зустріч. Ти — довірена особа цієї людини.',
  '{nom} a un rendez-vous : {lieu}, {creneau}. Tu es sa personne de confiance.':
    'У {nom} зустріч: {lieu}, {creneau}. Ти — довірена особа цієї людини.',
  // Vérification et photos
  'Ton profil est vérifié. Ton badge est visible, tu peux découvrir des profils.':
    'Твоя анкета перевірена. Значок видно, можна переглядати анкети.',
  'Voir des profils': 'Переглядати анкети',
  "Ta vérification n'a pas abouti : le geste ou le visage n'était pas assez visible. Tu peux réessayer.":
    'Перевірка не пройшла: жест або обличчя було видно недостатньо чітко. Можна спробувати ще раз.',
  'Réessayer': 'Спробувати ще раз',
  'Ta photo {n} est validée : les autres la voient maintenant.': 'Твоє фото {n} схвалено: тепер його бачать інші.',
  "Ta photo {n} a été refusée : visage peu visible, contenu inadapté, ou ce n'est pas toi. Elle est supprimée, tu peux en mettre une autre.":
    'Твоє фото {n} відхилено: обличчя погано видно, невідповідний вміст або це не ти. Фото видалено, можна завантажити інше.',
  'Changer de photo': 'Замінити фото',
  // Notifications de l'app
  'Les notifications {app} fonctionnent. Tu seras prévenu(e) ici des matchs et des messages.':
    'Сповіщення {app} працюють. Тут ти дізнаватимешся про метчі та повідомлення.',
  'Nouveau match : {nom} et toi, vous vous plaisez.': 'Новий метч: {nom} і ти сподобалися одне одному.',
  'Écrire': 'Написати',
  "Tu as plu à quelqu'un à {ville}. Ouvre {app} pour découvrir de qui il s'agit.":
    'Комусь у місті {ville} сподобалася твоя анкета. Відкрий {app}, щоб дізнатися кому.',
  'Découvrir': 'Дивитися',
  "{nom} t'a écrit : « {extrait} »": '{nom} пише тобі: «{extrait}»',
  'Répondre': 'Відповісти',
  '{nom} te propose un rendez-vous : {lieu} ({quartier}), {creneau}.': '{nom} пропонує зустріч: {lieu} ({quartier}), {creneau}.',
  'Voir la proposition': 'Відкрити пропозицію',
  '{nom} a accepté le rendez-vous : {lieu}, {creneau}.': '{nom} підтверджує зустріч: {lieu}, {creneau}.',
  '{nom} ne peut pas venir à {lieu}, {creneau}. Tu peux en proposer un autre.': '{nom} не зможе прийти: {lieu}, {creneau}. Ти можеш запропонувати іншу зустріч.',
  '{nom} a annulé le rendez-vous de {lieu}, {creneau}.': '{nom} скасовує зустріч: {lieu}, {creneau}.',
  '{nom} est bien arrivé(e) à {lieu}.': '{nom} на місці: {lieu}.',
  'Ouvrir la discussion': 'Відкрити чат',
};

const DICTIONNAIRES = { fr: {}, en: EN, ru: RU, uk: UK };

// Langue d'une personne : son choix explicite, sinon celle de son Telegram, sinon le français.
export function langueDe(user) {
  const choisie = String(user?.lang || '').toLowerCase();
  if (LANGUES.includes(choisie)) return choisie;
  const tg = String(user?.languageCode || '').slice(0, 2).toLowerCase();
  return LANGUES.includes(tg) ? tg : LANGUE_SOURCE;
}

export function t(lang, cle, vars) {
  let s = DICTIONNAIRES[lang]?.[cle] ?? cle;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}
