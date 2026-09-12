// Traduction côté serveur. Elle ne sert qu'aux messages que le bot envoie dans Telegram :
// l'interface, elle, traduit chez la personne (public/i18n.js), et les erreurs de l'API sont
// traduites par leur code. Le serveur n'a donc à connaître qu'une quinzaine de phrases.
//
// Même principe que côté navigateur : la clé est la phrase française, une clé manquante retombe
// sur du français lisible.

export const LANGUES = ['fr', 'en'];
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

const DICTIONNAIRES = { fr: {}, en: EN };

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
