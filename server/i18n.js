// Traduction côté serveur. Elle ne sert qu'aux messages que le bot envoie dans Telegram :
// l'interface, elle, traduit chez la personne (public/i18n.js), et les erreurs de l'API sont
// traduites par leur code. Le serveur n'a donc à connaître qu'une quinzaine de phrases.
//
// Même principe que côté navigateur : la clé est la phrase française, une clé manquante retombe
// sur du français lisible.

export const LANGUES = ['fr', 'en', 'es', 'pt', 'sw', 'ru', 'uk'];
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

const ES = {
  "Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans jamais te demander d'argent.\n\nRéservé aux 18 ans et plus.": "Hola {nom}. {app} te presenta a personas verificadas de tu ciudad, y nunca te pide dinero.\n\nSolo para mayores de 18 años.",
  "Ouvrir {app}": "Abrir {app}",
  "{app} ne te demandera jamais d'argent. Si quelqu'un le fait, signale-le depuis la discussion dans l'app.\n\nPour supprimer ton compte : Paramètres dans l'app, puis « Supprimer mon compte ».": "{app} nunca te pedirá dinero. Si alguien lo hace, denúncialo desde la conversación en la app.\n\nPara eliminar tu cuenta: Ajustes en la app, y después « Eliminar mi cuenta ».",
  "Identifiant de cette discussion : {id}": "Identificador de esta conversación: {id}",
  "{nom} te choisit comme personne de confiance sur {app}.\n\nSi tu acceptes, tu recevras un message quand {nom} part à un rendez-vous, avec le lieu et l'heure, et un autre quand {nom} arrive sur place. Tu ne verras rien d'autre : ni avec qui, ni les discussions.\n\nOn garde ton prénom et ton compte Telegram, rien de plus, et tu peux te retirer quand tu veux avec /retirer.": "{nom} te elige como su persona de confianza en {app}.\n\nSi aceptas, recibirás un mensaje cuando {nom} salga hacia una cita, con el lugar y la hora, y otro cuando {nom} llegue. No verás nada más: ni con quién, ni las conversaciones.\n\nGuardamos tu nombre y tu cuenta de Telegram, nada más, y puedes retirarte cuando quieras con /retirer.",
  "J'accepte": "Acepto",
  "Non merci": "No, gracias",
  "Cette invitation n'est plus valable. Demande à ton amie ou ton ami de t'en envoyer une autre.": "Esta invitación ya no es válida. Pide a tu amiga o amigo que te envíe otra.",
  "Cette invitation n'est plus valable.": "Esta invitación ya no es válida.",
  "Choisis quelqu'un d'autre que toi.": "Elige a alguien que no seas tú.",
  "Ce compte n'existe plus.": "Esta cuenta ya no existe.",
  "C'est noté, rien n'a été enregistré.": "Entendido, no se ha guardado nada.",
  "C'est fait. Tu seras prévenu quand {nom} part à un rendez-vous. Pour te retirer : /retirer.": "Hecho. Te avisaremos cuando {nom} salga hacia una cita. Para retirarte: /retirer.",
  "{nom} a accepté d'être ta personne de confiance.": "{nom} ha aceptado ser tu persona de confianza.",
  "Personne ne t'a choisi comme personne de confiance.": "Nadie te ha elegido como su persona de confianza.",
  "{nom} ne souhaite plus être ta personne de confiance. Tu peux en désigner une autre.": "{nom} ya no desea ser tu persona de confianza. Puedes elegir a otra.",
  "C'est fait, tu ne recevras plus rien. Ton prénom et ton compte ont été effacés.": "Hecho, ya no recibirás nada más. Tu nombre y tu cuenta han sido borrados.",
  "{nom} ne t'a plus comme personne de confiance. Tu ne recevras plus rien.": "{nom} ya no te tiene como persona de confianza. No recibirás nada más.",
  "{nom} te prévient : elle ou il part à un rendez-vous maintenant. Tu es sa personne de confiance.": "{nom} te avisa: sale hacia una cita ahora. Eres su persona de confianza.",
  "{nom} a un rendez-vous : {lieu}, {creneau}. Tu es sa personne de confiance.": "{nom} tiene una cita: {lieu}, {creneau}. Eres su persona de confianza.",
  "Ton profil est vérifié. Ton badge est visible, tu peux découvrir des profils.": "Tu perfil está verificado. Tu insignia es visible y ya puedes ver perfiles.",
  "Voir des profils": "Ver perfiles",
  "Ta vérification n'a pas abouti : le geste ou le visage n'était pas assez visible. Tu peux réessayer.": "Tu verificación no ha salido bien: el gesto o la cara no se veían con claridad. Puedes intentarlo de nuevo.",
  "Réessayer": "Reintentar",
  "Ta photo {n} est validée : les autres la voient maintenant.": "Tu foto {n} está aprobada: los demás ya pueden verla.",
  "Voir mon profil": "Ver mi perfil",
  "Ta photo {n} a été refusée : visage peu visible, contenu inadapté, ou ce n'est pas toi. Elle est supprimée, tu peux en mettre une autre.": "Tu foto {n} ha sido rechazada: cara poco visible, contenido inadecuado, o no eres tú. Se ha eliminado, puedes poner otra.",
  "Changer de photo": "Cambiar de foto",
  "Les notifications {app} fonctionnent. Tu seras prévenu(e) ici des matchs et des messages.": "Las notificaciones de {app} funcionan. Aquí te avisaremos de los matchs y los mensajes.",
  "Nouveau match : {nom} et toi, vous vous plaisez.": "Nuevo match: a {nom} y a ti os gustáis.",
  "Écrire": "Escribir",
  "Tu as plu à quelqu'un à {ville}. Ouvre {app} pour découvrir de qui il s'agit.": "Le gustas a alguien de {ville}. Abre {app} para descubrir quién es.",
  "Découvrir": "Descubrir",
  "{nom} t'a écrit : « {extrait} »": "{nom} te ha escrito: « {extrait} »",
  "Répondre": "Responder",
  "{nom} te propose un rendez-vous : {lieu} ({quartier}), {creneau}.": "{nom} te propone una cita: {lieu} ({quartier}), {creneau}.",
  "Voir la proposition": "Ver la propuesta",
  "{nom} a accepté le rendez-vous : {lieu}, {creneau}.": "{nom} ha aceptado la cita: {lieu}, {creneau}.",
  "{nom} ne peut pas venir à {lieu}, {creneau}. Tu peux en proposer un autre.": "{nom} no puede ir a {lieu}, {creneau}. Puedes proponer otra.",
  "{nom} a annulé le rendez-vous de {lieu}, {creneau}.": "{nom} ha cancelado la cita de {lieu}, {creneau}.",
  "{nom} est bien arrivé(e) à {lieu}.": "{nom} ha llegado a {lieu}.",
  "Ouvrir la discussion": "Abrir la conversación",
};

const PT = {
  "Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans jamais te demander d'argent.\n\nRéservé aux 18 ans et plus.": "Olá {nom}. A {app} apresenta-te pessoas verificadas da tua cidade, e nunca te pede dinheiro.\n\nApenas para maiores de 18 anos.",
  "Ouvrir {app}": "Abrir {app}",
  "{app} ne te demandera jamais d'argent. Si quelqu'un le fait, signale-le depuis la discussion dans l'app.\n\nPour supprimer ton compte : Paramètres dans l'app, puis « Supprimer mon compte ».": "A {app} nunca te vai pedir dinheiro. Se alguém o fizer, denuncia a partir da conversa na app.\n\nPara eliminar a tua conta: Definições na app, e depois « Eliminar a minha conta ».",
  "Identifiant de cette discussion : {id}": "Identificador desta conversa: {id}",
  "{nom} te choisit comme personne de confiance sur {app}.\n\nSi tu acceptes, tu recevras un message quand {nom} part à un rendez-vous, avec le lieu et l'heure, et un autre quand {nom} arrive sur place. Tu ne verras rien d'autre : ni avec qui, ni les discussions.\n\nOn garde ton prénom et ton compte Telegram, rien de plus, et tu peux te retirer quand tu veux avec /retirer.": "{nom} escolhe-te como pessoa de confiança na {app}.\n\nSe aceitares, vais receber uma mensagem quando {nom} sair para um encontro, com o local e a hora, e outra quando {nom} chegar. Não verás mais nada: nem com quem, nem as conversas.\n\nGuardamos o teu nome e a tua conta de Telegram, mais nada, e podes retirar-te quando quiseres com /retirer.",
  "J'accepte": "Aceito",
  "Non merci": "Não, obrigado",
  "Cette invitation n'est plus valable. Demande à ton amie ou ton ami de t'en envoyer une autre.": "Este convite já não é válido. Pede à tua amiga ou ao teu amigo que te envie outro.",
  "Cette invitation n'est plus valable.": "Este convite já não é válido.",
  "Choisis quelqu'un d'autre que toi.": "Escolhe outra pessoa que não sejas tu.",
  "Ce compte n'existe plus.": "Esta conta já não existe.",
  "C'est noté, rien n'a été enregistré.": "Entendido, não foi guardado nada.",
  "C'est fait. Tu seras prévenu quand {nom} part à un rendez-vous. Pour te retirer : /retirer.": "Feito. Serás avisado quando {nom} sair para um encontro. Para te retirares: /retirer.",
  "{nom} a accepté d'être ta personne de confiance.": "{nom} aceitou ser a tua pessoa de confiança.",
  "Personne ne t'a choisi comme personne de confiance.": "Ninguém te escolheu como pessoa de confiança.",
  "{nom} ne souhaite plus être ta personne de confiance. Tu peux en désigner une autre.": "{nom} já não quer ser a tua pessoa de confiança. Podes escolher outra.",
  "C'est fait, tu ne recevras plus rien. Ton prénom et ton compte ont été effacés.": "Feito, não vais receber mais nada. O teu nome e a tua conta foram apagados.",
  "{nom} ne t'a plus comme personne de confiance. Tu ne recevras plus rien.": "{nom} já não te tem como pessoa de confiança. Não vais receber mais nada.",
  "{nom} te prévient : elle ou il part à un rendez-vous maintenant. Tu es sa personne de confiance.": "{nom} avisa-te: vai sair para um encontro agora. És a pessoa de confiança dela.",
  "{nom} a un rendez-vous : {lieu}, {creneau}. Tu es sa personne de confiance.": "{nom} tem um encontro: {lieu}, {creneau}. És a pessoa de confiança dela.",
  "Ton profil est vérifié. Ton badge est visible, tu peux découvrir des profils.": "O teu perfil está verificado. O teu selo está visível e já podes ver perfis.",
  "Voir des profils": "Ver perfis",
  "Ta vérification n'a pas abouti : le geste ou le visage n'était pas assez visible. Tu peux réessayer.": "A tua verificação não resultou: o gesto ou o rosto não estavam suficientemente visíveis. Podes tentar outra vez.",
  "Réessayer": "Tentar outra vez",
  "Ta photo {n} est validée : les autres la voient maintenant.": "A tua foto {n} foi aprovada: os outros já a podem ver.",
  "Voir mon profil": "Ver o meu perfil",
  "Ta photo {n} a été refusée : visage peu visible, contenu inadapté, ou ce n'est pas toi. Elle est supprimée, tu peux en mettre une autre.": "A tua foto {n} foi recusada: rosto pouco visível, conteúdo inadequado, ou não és tu. Foi eliminada, podes pôr outra.",
  "Changer de photo": "Mudar de foto",
  "Les notifications {app} fonctionnent. Tu seras prévenu(e) ici des matchs et des messages.": "As notificações da {app} funcionam. Vais ser avisado aqui dos matchs e das mensagens.",
  "Nouveau match : {nom} et toi, vous vous plaisez.": "Novo match: tu e {nom} gostam um do outro.",
  "Écrire": "Escrever",
  "Tu as plu à quelqu'un à {ville}. Ouvre {app} pour découvrir de qui il s'agit.": "Alguém em {ville} gostou do teu perfil. Abre a {app} para descobrir quem é.",
  "Découvrir": "Descobrir",
  "{nom} t'a écrit : « {extrait} »": "{nom} escreveu-te: « {extrait} »",
  "Répondre": "Responder",
  "{nom} te propose un rendez-vous : {lieu} ({quartier}), {creneau}.": "{nom} propõe-te um encontro: {lieu} ({quartier}), {creneau}.",
  "Voir la proposition": "Ver a proposta",
  "{nom} a accepté le rendez-vous : {lieu}, {creneau}.": "{nom} aceitou o encontro: {lieu}, {creneau}.",
  "{nom} ne peut pas venir à {lieu}, {creneau}. Tu peux en proposer un autre.": "{nom} não pode ir a {lieu}, {creneau}. Podes propor outro.",
  "{nom} a annulé le rendez-vous de {lieu}, {creneau}.": "{nom} cancelou o encontro de {lieu}, {creneau}.",
  "{nom} est bien arrivé(e) à {lieu}.": "{nom} chegou a {lieu}.",
  "Ouvrir la discussion": "Abrir a conversa",
};

const SW = {
  "Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans jamais te demander d'argent.\n\nRéservé aux 18 ans et plus.": "Habari {nom}. {app} inakuunganisha na watu waliothibitishwa wa mji wako, na haikuombi pesa kamwe.\n\nKwa wenye miaka 18 na zaidi tu.",
  "Ouvrir {app}": "Fungua {app}",
  "{app} ne te demandera jamais d'argent. Si quelqu'un le fait, signale-le depuis la discussion dans l'app.\n\nPour supprimer ton compte : Paramètres dans l'app, puis « Supprimer mon compte ».": "{app} haitakuomba pesa kamwe. Mtu akifanya hivyo, mripoti kutoka kwenye mazungumzo ndani ya programu.\n\nKufuta akaunti yako: Mipangilio ndani ya programu, kisha « Futa akaunti yangu ».",
  "Identifiant de cette discussion : {id}": "Kitambulisho cha mazungumzo haya: {id}",
  "{nom} te choisit comme personne de confiance sur {app}.\n\nSi tu acceptes, tu recevras un message quand {nom} part à un rendez-vous, avec le lieu et l'heure, et un autre quand {nom} arrive sur place. Tu ne verras rien d'autre : ni avec qui, ni les discussions.\n\nOn garde ton prénom et ton compte Telegram, rien de plus, et tu peux te retirer quand tu veux avec /retirer.": "{nom} anakuchagua uwe mtu anayemwamini kwenye {app}.\n\nUkikubali, utapokea ujumbe {nom} anapoondoka kwenda kwenye mkutano, wenye mahali na saa, na mwingine {nom} anapofika. Hutaona kitu kingine: wala na nani, wala mazungumzo.\n\nTunahifadhi jina lako na akaunti yako ya Telegram, si zaidi, na unaweza kujiondoa wakati wowote kwa /retirer.",
  "J'accepte": "Nakubali",
  "Non merci": "Hapana, asante",
  "Cette invitation n'est plus valable. Demande à ton amie ou ton ami de t'en envoyer une autre.": "Mwaliko huu hauna nguvu tena. Mwombe rafiki yako akutumie mwingine.",
  "Cette invitation n'est plus valable.": "Mwaliko huu hauna nguvu tena.",
  "Choisis quelqu'un d'autre que toi.": "Chagua mtu mwingine, si wewe.",
  "Ce compte n'existe plus.": "Akaunti hii haipo tena.",
  "C'est noté, rien n'a été enregistré.": "Imeeleweka, hakuna kilichohifadhiwa.",
  "C'est fait. Tu seras prévenu quand {nom} part à un rendez-vous. Pour te retirer : /retirer.": "Imefanyika. Utaarifiwa {nom} anapoondoka kwenda kwenye mkutano. Kujiondoa: /retirer.",
  "{nom} a accepté d'être ta personne de confiance.": "{nom} amekubali kuwa mtu unayemwamini.",
  "Personne ne t'a choisi comme personne de confiance.": "Hakuna aliyekuchagua uwe mtu anayemwamini.",
  "{nom} ne souhaite plus être ta personne de confiance. Tu peux en désigner une autre.": "{nom} hataki tena kuwa mtu unayemwamini. Unaweza kumchagua mwingine.",
  "C'est fait, tu ne recevras plus rien. Ton prénom et ton compte ont été effacés.": "Imefanyika, hutapokea kitu tena. Jina lako na akaunti yako vimefutwa.",
  "{nom} ne t'a plus comme personne de confiance. Tu ne recevras plus rien.": "{nom} hakuna tena kama mtu anayemwamini. Hutapokea kitu tena.",
  "{nom} te prévient : elle ou il part à un rendez-vous maintenant. Tu es sa personne de confiance.": "{nom} anakujulisha: anaondoka kwenda kwenye mkutano sasa. Wewe ni mtu anayemwamini.",
  "{nom} a un rendez-vous : {lieu}, {creneau}. Tu es sa personne de confiance.": "{nom} ana mkutano: {lieu}, {creneau}. Wewe ni mtu anayemwamini.",
  "Ton profil est vérifié. Ton badge est visible, tu peux découvrir des profils.": "Wasifu wako umethibitishwa. Alama yako inaonekana, na sasa unaweza kuona wasifu.",
  "Voir des profils": "Angalia wasifu",
  "Ta vérification n'a pas abouti : le geste ou le visage n'était pas assez visible. Tu peux réessayer.": "Uthibitisho wako haukufanikiwa: ishara au uso haukuonekana vya kutosha. Unaweza kujaribu tena.",
  "Réessayer": "Jaribu tena",
  "Ta photo {n} est validée : les autres la voient maintenant.": "Picha yako {n} imethibitishwa: wengine wanaweza kuiona sasa.",
  "Voir mon profil": "Ona wasifu wangu",
  "Ta photo {n} a été refusée : visage peu visible, contenu inadapté, ou ce n'est pas toi. Elle est supprimée, tu peux en mettre une autre.": "Picha yako {n} imekataliwa: uso hauonekani vizuri, maudhui hayafai, au si wewe. Imefutwa, unaweza kuweka nyingine.",
  "Changer de photo": "Badilisha picha",
  "Les notifications {app} fonctionnent. Tu seras prévenu(e) ici des matchs et des messages.": "Arifa za {app} zinafanya kazi. Utaarifiwa hapa kuhusu match na ujumbe.",
  "Nouveau match : {nom} et toi, vous vous plaisez.": "Match mpya: wewe na {nom} mnapendana.",
  "Écrire": "Andika",
  "Tu as plu à quelqu'un à {ville}. Ouvre {app} pour découvrir de qui il s'agit.": "Mtu mmoja {ville} amependa wasifu wako. Fungua {app} ili ujue ni nani.",
  "Découvrir": "Gundua",
  "{nom} t'a écrit : « {extrait} »": "{nom} amekuandikia: « {extrait} »",
  "Répondre": "Jibu",
  "{nom} te propose un rendez-vous : {lieu} ({quartier}), {creneau}.": "{nom} anakupendekezea mkutano: {lieu} ({quartier}), {creneau}.",
  "Voir la proposition": "Ona pendekezo",
  "{nom} a accepté le rendez-vous : {lieu}, {creneau}.": "{nom} amekubali mkutano: {lieu}, {creneau}.",
  "{nom} ne peut pas venir à {lieu}, {creneau}. Tu peux en proposer un autre.": "{nom} hawezi kufika {lieu}, {creneau}. Unaweza kupendekeza mwingine.",
  "{nom} a annulé le rendez-vous de {lieu}, {creneau}.": "{nom} ameghairi mkutano wa {lieu}, {creneau}.",
  "{nom} est bien arrivé(e) à {lieu}.": "{nom} amefika {lieu}.",
  "Ouvrir la discussion": "Fungua mazungumzo",
};

const RU = {
  'Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans jamais te demander d\'argent.\n\nRéservé aux 18 ans et plus.': "Привет, {nom}. {app} знакомит тебя с проверенными людьми твоего города и никогда не просит у тебя денег.\n\nТолько для 18 лет и старше.",
  'Ouvrir {app}': "Открыть {app}",
  '{app} ne te demandera jamais d\'argent. Si quelqu\'un le fait, signale-le depuis la discussion dans l\'app.\n\nPour supprimer ton compte : Paramètres dans l\'app, puis « Supprimer mon compte ».': "{app} никогда не попросит у тебя денег. Если кто-то это делает, пожалуйся на него из чата в приложении.\n\nЧтобы удалить аккаунт: Настройки в приложении, затем «Удалить аккаунт».",
  'Identifiant de cette discussion : {id}': "Идентификатор этого чата: {id}",
  "{nom} te choisit comme personne de confiance sur {app}.\n\nSi tu acceptes, tu recevras un message quand {nom} part à un rendez-vous, avec le lieu et l'heure, et un autre quand {nom} arrive sur place. Tu ne verras rien d'autre : ni avec qui, ni les discussions.\n\nOn garde ton prénom et ton compte Telegram, rien de plus, et tu peux te retirer quand tu veux avec /retirer.": "{nom} выбирает тебя доверенным человеком в {app}.\n\nЕсли согласишься, ты получишь сообщение, когда {nom} выходит на встречу, с местом и временем, и ещё одно, когда {nom} приходит на место. Больше ты не увидишь ничего: ни с кем, ни переписку.\n\nМы храним твоё имя и аккаунт Telegram, не больше, и ты можешь отказаться в любой момент командой /retirer.",
  "J'accepte": "Я согласен",
  'Non merci': "Нет, спасибо",
  "Cette invitation n'est plus valable. Demande à ton amie ou ton ami de t'en envoyer une autre.": "Это приглашение больше не действует. Попроси подругу или друга прислать новое.",
  "Cette invitation n'est plus valable.": "Это приглашение больше не действует.",
  "Choisis quelqu'un d'autre que toi.": "Выбери кого-то другого, не себя.",
  "Ce compte n'existe plus.": "Этого аккаунта больше нет.",
  "C'est noté, rien n'a été enregistré.": "Принято, ничего не сохранено.",
  "C'est fait. Tu seras prévenu quand {nom} part à un rendez-vous. Pour te retirer : /retirer.": "Готово. Тебе сообщат, когда {nom} выходит на встречу. Чтобы отказаться: /retirer.",
  "{nom} a accepté d'être ta personne de confiance.": "{nom} согласился быть твоим доверенным человеком.",
  "Personne ne t'a choisi comme personne de confiance.": "Тебя никто не выбрал доверенным человеком.",
  "{nom} ne souhaite plus être ta personne de confiance. Tu peux en désigner une autre.": "{nom} больше не хочет быть твоим доверенным человеком. Ты можешь выбрать другого.",
  "C'est fait, tu ne recevras plus rien. Ton prénom et ton compte ont été effacés.": "Готово, ты больше ничего не будешь получать. Твоё имя и твой аккаунт стёрты.",
  "{nom} ne t'a plus comme personne de confiance. Tu ne recevras plus rien.": "{nom} больше не считает тебя доверенным человеком. Ты больше ничего не будешь получать.",
  "{nom} te prévient : elle ou il part à un rendez-vous maintenant. Tu es sa personne de confiance.": "{nom} предупреждает: сейчас выходит на встречу. Ты доверенный человек.",
  '{nom} a un rendez-vous : {lieu}, {creneau}. Tu es sa personne de confiance.': "У {nom} встреча: {lieu}, {creneau}. Ты доверенный человек.",
  'Ton profil est vérifié. Ton badge est visible, tu peux découvrir des profils.': "Твоя анкета проверена. Значок виден, можно смотреть анкеты.",
  'Voir des profils': "Смотреть анкеты",
  "Ta vérification n'a pas abouti : le geste ou le visage n'était pas assez visible. Tu peux réessayer.": "Проверка не прошла: жест или лицо было видно недостаточно хорошо. Можно попробовать снова.",
  'Réessayer': "Повторить",
  'Ta photo {n} est validée : les autres la voient maintenant.': "Твоё фото {n} одобрено: теперь его видят другие.",
  'Voir mon profil': "Моя анкета",
  "Ta photo {n} a été refusée : visage peu visible, contenu inadapté, ou ce n'est pas toi. Elle est supprimée, tu peux en mettre une autre.": "Твоё фото {n} отклонено: лицо плохо видно, неподходящее содержание, или это не ты. Оно удалено, можно поставить другое.",
  'Changer de photo': "Заменить фото",
  'Les notifications {app} fonctionnent. Tu seras prévenu(e) ici des matchs et des messages.': "Уведомления {app} работают. Здесь ты будешь узнавать о мэтчах и сообщениях.",
  'Nouveau match : {nom} et toi, vous vous plaisez.': "Новый мэтч: вы с {nom} понравились друг другу.",
  'Écrire': "Написать",
  "Tu as plu à quelqu'un à {ville}. Ouvre {app} pour découvrir de qui il s'agit.": "Ты понравился кому-то в городе {ville}. Открой {app}, чтобы узнать кому.",
  'Découvrir': "Смотреть",
  "{nom} t'a écrit : « {extrait} »": "{nom} пишет тебе: «{extrait}»",
  'Répondre': "Ответить",
  '{nom} te propose un rendez-vous : {lieu} ({quartier}), {creneau}.': "{nom} предлагает тебе встречу: {lieu} ({quartier}), {creneau}.",
  'Voir la proposition': "Посмотреть приглашение",
  '{nom} a accepté le rendez-vous : {lieu}, {creneau}.': "{nom} принял встречу: {lieu}, {creneau}.",
  '{nom} ne peut pas venir à {lieu}, {creneau}. Tu peux en proposer un autre.': "{nom} не может прийти в {lieu}, {creneau}. Можешь предложить другую встречу.",
  '{nom} a annulé le rendez-vous de {lieu}, {creneau}.': "{nom} отменил встречу {lieu}, {creneau}.",
  '{nom} est bien arrivé(e) à {lieu}.': "{nom} на месте: {lieu}.",
  'Ouvrir la discussion': "Открыть чат",
};

const UK = {
  'Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans jamais te demander d\'argent.\n\nRéservé aux 18 ans et plus.': "Привіт, {nom}. {app} знайомить тебе з перевіреними людьми твого міста й ніколи не просить у тебе грошей.\n\nЛише для 18 років і старше.",
  'Ouvrir {app}': "Відкрити {app}",
  '{app} ne te demandera jamais d\'argent. Si quelqu\'un le fait, signale-le depuis la discussion dans l\'app.\n\nPour supprimer ton compte : Paramètres dans l\'app, puis « Supprimer mon compte ».': "{app} ніколи не попросить у тебе грошей. Якщо хтось це робить, поскаржся на нього з чату в застосунку.\n\nЩоб видалити акаунт: Налаштування в застосунку, потім «Видалити акаунт».",
  'Identifiant de cette discussion : {id}': "Ідентифікатор цього чату: {id}",
  "{nom} te choisit comme personne de confiance sur {app}.\n\nSi tu acceptes, tu recevras un message quand {nom} part à un rendez-vous, avec le lieu et l'heure, et un autre quand {nom} arrive sur place. Tu ne verras rien d'autre : ni avec qui, ni les discussions.\n\nOn garde ton prénom et ton compte Telegram, rien de plus, et tu peux te retirer quand tu veux avec /retirer.": "{nom} обирає тебе довіреною людиною в {app}.\n\nЯкщо погодишся, ти отримаєш повідомлення, коли {nom} виходить на зустріч, з місцем і часом, і ще одне, коли {nom} приходить на місце. Більше ти не побачиш нічого: ні з ким, ні листування.\n\nМи зберігаємо твоє ім'я та акаунт Telegram, не більше, і ти можеш відмовитися будь-коли командою /retirer.",
  "J'accepte": "Я погоджуюся",
  'Non merci': "Ні, дякую",
  "Cette invitation n'est plus valable. Demande à ton amie ou ton ami de t'en envoyer une autre.": "Це запрошення більше не дійсне. Попроси подругу або друга надіслати нове.",
  "Cette invitation n'est plus valable.": "Це запрошення більше не дійсне.",
  "Choisis quelqu'un d'autre que toi.": "Обери когось іншого, не себе.",
  "Ce compte n'existe plus.": "Цього акаунта більше немає.",
  "C'est noté, rien n'a été enregistré.": "Прийнято, нічого не збережено.",
  "C'est fait. Tu seras prévenu quand {nom} part à un rendez-vous. Pour te retirer : /retirer.": "Готово. Тобі повідомлять, коли {nom} виходить на зустріч. Щоб відмовитися: /retirer.",
  "{nom} a accepté d'être ta personne de confiance.": "{nom} погодився бути твоєю довіреною людиною.",
  "Personne ne t'a choisi comme personne de confiance.": "Тебе ніхто не обрав довіреною людиною.",
  "{nom} ne souhaite plus être ta personne de confiance. Tu peux en désigner une autre.": "{nom} більше не хоче бути твоєю довіреною людиною. Ти можеш обрати іншу.",
  "C'est fait, tu ne recevras plus rien. Ton prénom et ton compte ont été effacés.": "Готово, ти більше нічого не отримуватимеш. Твоє ім'я і твій акаунт стерто.",
  "{nom} ne t'a plus comme personne de confiance. Tu ne recevras plus rien.": "{nom} більше не має тебе як довірену людину. Ти більше нічого не отримуватимеш.",
  "{nom} te prévient : elle ou il part à un rendez-vous maintenant. Tu es sa personne de confiance.": "{nom} попереджає: зараз виходить на зустріч. Ти довірена людина.",
  '{nom} a un rendez-vous : {lieu}, {creneau}. Tu es sa personne de confiance.': "У {nom} зустріч: {lieu}, {creneau}. Ти довірена людина.",
  'Ton profil est vérifié. Ton badge est visible, tu peux découvrir des profils.': "Твою анкету перевірено. Значок видно, можна дивитися анкети.",
  'Voir des profils': "Дивитися анкети",
  "Ta vérification n'a pas abouti : le geste ou le visage n'était pas assez visible. Tu peux réessayer.": "Перевірка не пройшла: жест або обличчя було видно недостатньо добре. Можна спробувати знову.",
  'Réessayer': "Повторити",
  'Ta photo {n} est validée : les autres la voient maintenant.': "Твоє фото {n} схвалено: тепер його бачать інші.",
  'Voir mon profil': "Моя анкета",
  "Ta photo {n} a été refusée : visage peu visible, contenu inadapté, ou ce n'est pas toi. Elle est supprimée, tu peux en mettre une autre.": "Твоє фото {n} відхилено: обличчя погано видно, невідповідний вміст, або це не ти. Його видалено, можна поставити інше.",
  'Changer de photo': "Замінити фото",
  'Les notifications {app} fonctionnent. Tu seras prévenu(e) ici des matchs et des messages.': "Сповіщення {app} працюють. Тут ти дізнаватимешся про метчі й повідомлення.",
  'Nouveau match : {nom} et toi, vous vous plaisez.': "Новий метч: ви з {nom} сподобалися одне одному.",
  'Écrire': "Написати",
  "Tu as plu à quelqu'un à {ville}. Ouvre {app} pour découvrir de qui il s'agit.": "Ти сподобався комусь у місті {ville}. Відкрий {app}, щоб дізнатися кому.",
  'Découvrir': "Дивитися",
  "{nom} t'a écrit : « {extrait} »": "{nom} пише тобі: «{extrait}»",
  'Répondre': "Відповісти",
  '{nom} te propose un rendez-vous : {lieu} ({quartier}), {creneau}.': "{nom} пропонує тобі зустріч: {lieu} ({quartier}), {creneau}.",
  'Voir la proposition': "Переглянути запрошення",
  '{nom} a accepté le rendez-vous : {lieu}, {creneau}.': "{nom} прийняв зустріч: {lieu}, {creneau}.",
  '{nom} ne peut pas venir à {lieu}, {creneau}. Tu peux en proposer un autre.': "{nom} не може прийти в {lieu}, {creneau}. Можеш запропонувати іншу зустріч.",
  '{nom} a annulé le rendez-vous de {lieu}, {creneau}.': "{nom} скасував зустріч {lieu}, {creneau}.",
  '{nom} est bien arrivé(e) à {lieu}.': "{nom} на місці: {lieu}.",
  'Ouvrir la discussion': "Відкрити чат",
};

const DICTIONNAIRES = { fr: {}, en: EN, es: ES, pt: PT, sw: SW, ru: RU, uk: UK };

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
