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

export const LANGUES = ['fr', 'en', 'es', 'pt', 'sw', 'ru', 'uk'];
export const LANGUE_SOURCE = 'fr';

const EN = {
  // Bot
  'Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans rien te faire payer pour ça.\n\nRéservé aux 18 ans et plus.':
    'Hi {nom}. {app} introduces you to verified people near you, and charges you nothing for it.\n\nFor ages 18 and over.',
  'Ouvrir {app}': 'Open {app}',
  '{app} ne te demandera jamais d\'argent par message. Si quelqu\'un le fait, même en son nom, c\'est une arnaque : signale-le depuis la discussion dans l\'app.\n\nPour supprimer ton compte : Paramètres dans l\'app, puis « Supprimer mon compte ».':
    '{app} will never ask you for money by message. If someone does, even in our name, it is a scam: report them from the chat in the app.\n\nTo delete your account: Settings in the app, then "Delete my account".',
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
  "Ta personne de confiance a supprimé son compte {app}. Tu peux en désigner une autre.": "Your trusted person has deleted their {app} account. You can choose another one.",
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
  "Tu as plu à quelqu'un à {ville}. Continue à découvrir : tu le croiseras dans ton paquet.":
    'Someone in {ville} likes your profile. Keep browsing: you will come across them in your deck.',
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
  // Odo Plus
  "Ton pass {app} Plus est actif jusqu'au {date}.": 'Your {app} Plus pass is active until {date}.',
  'Ton pass {app} Plus a été retiré.': 'Your {app} Plus pass has been removed.',
};

const ES = {
  "Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans rien te faire payer pour ça.\n\nRéservé aux 18 ans et plus.": "Hola {nom}. {app} te presenta a personas verificadas de tu ciudad, y no te cobra nada por ello.\n\nSolo para mayores de 18 años.",
  "Ouvrir {app}": "Abrir {app}",
  "{app} ne te demandera jamais d'argent par message. Si quelqu'un le fait, même en son nom, c'est une arnaque : signale-le depuis la discussion dans l'app.\n\nPour supprimer ton compte : Paramètres dans l'app, puis « Supprimer mon compte ».": "{app} nunca te pedirá dinero por mensaje. Si alguien lo hace, incluso en nuestro nombre, es una estafa: denúncialo desde la conversación en la app.\n\nPara eliminar tu cuenta: Ajustes en la app, y después « Eliminar mi cuenta ».",
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
  "Ta personne de confiance a supprimé son compte {app}. Tu peux en désigner une autre.": "Tu persona de confianza ha eliminado su cuenta de {app}. Puedes elegir a otra.",
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
  "Tu as plu à quelqu'un à {ville}. Continue à découvrir : tu le croiseras dans ton paquet.": "Le gustas a alguien de {ville}. Sigue descubriendo: te lo cruzarás en tu mazo.",
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
  // Odo Plus
  "Ton pass {app} Plus est actif jusqu'au {date}.": "Tu pase {app} Plus está activo hasta el {date}.",
  'Ton pass {app} Plus a été retiré.': "Tu pase {app} Plus ha sido retirado.",
};

const PT = {
  "Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans rien te faire payer pour ça.\n\nRéservé aux 18 ans et plus.": "Olá {nom}. A {app} apresenta-te pessoas verificadas da tua cidade, e não te cobra nada por isso.\n\nApenas para maiores de 18 anos.",
  "Ouvrir {app}": "Abrir {app}",
  "{app} ne te demandera jamais d'argent par message. Si quelqu'un le fait, même en son nom, c'est une arnaque : signale-le depuis la discussion dans l'app.\n\nPour supprimer ton compte : Paramètres dans l'app, puis « Supprimer mon compte ».": "A {app} nunca te vai pedir dinheiro por mensagem. Se alguém o fizer, mesmo em nosso nome, é uma burla: denuncia a partir da conversa na app.\n\nPara eliminar a tua conta: Definições na app, e depois « Eliminar a minha conta ».",
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
  "Ta personne de confiance a supprimé son compte {app}. Tu peux en désigner une autre.": "A tua pessoa de confiança eliminou a sua conta {app}. Podes escolher outra.",
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
  "Tu as plu à quelqu'un à {ville}. Continue à découvrir : tu le croiseras dans ton paquet.": "Alguém em {ville} gostou do teu perfil. Continua a descobrir: vais cruzar-te com essa pessoa no teu baralho.",
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
  // Odo Plus
  "Ton pass {app} Plus est actif jusqu'au {date}.": "O teu passe {app} Plus está ativo até {date}.",
  'Ton pass {app} Plus a été retiré.': "O teu passe {app} Plus foi retirado.",
};

const SW = {
  "Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans rien te faire payer pour ça.\n\nRéservé aux 18 ans et plus.": "Habari {nom}. {app} inakuunganisha na watu waliothibitishwa wa mji wako, bila kukutoza chochote.\n\nKwa wenye miaka 18 na zaidi tu.",
  "Ouvrir {app}": "Fungua {app}",
  "{app} ne te demandera jamais d'argent par message. Si quelqu'un le fait, même en son nom, c'est une arnaque : signale-le depuis la discussion dans l'app.\n\nPour supprimer ton compte : Paramètres dans l'app, puis « Supprimer mon compte ».": "{app} haitakuomba pesa kwa ujumbe kamwe. Mtu akifanya hivyo, hata kwa jina letu, ni ulaghai: mripoti kutoka kwenye mazungumzo ndani ya programu.\n\nKufuta akaunti yako: Mipangilio ndani ya programu, kisha « Futa akaunti yangu ».",
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
  "Ta personne de confiance a supprimé son compte {app}. Tu peux en désigner une autre.": "Mtu wako wa kuaminika amefuta akaunti yake ya {app}. Unaweza kuchagua mwingine.",
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
  "Tu as plu à quelqu'un à {ville}. Continue à découvrir : tu le croiseras dans ton paquet.": "Mtu mmoja {ville} amependa wasifu wako. Endelea kutazama: utamkuta kwenye rundo lako.",
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
  // Odo Plus
  "Ton pass {app} Plus est actif jusqu'au {date}.": "Pasi yako ya {app} Plus inatumika hadi {date}.",
  'Ton pass {app} Plus a été retiré.': "Pasi yako ya {app} Plus imeondolewa.",
};

const RU = {
  // Bot
  'Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans rien te faire payer pour ça.\n\nRéservé aux 18 ans et plus.':
    'Привет, {nom}. {app} знакомит тебя с проверенными людьми из твоего города и ничего за это не берёт.\n\nТолько с 18 лет.',
  'Ouvrir {app}': 'Открыть {app}',
  '{app} ne te demandera jamais d\'argent par message. Si quelqu\'un le fait, même en son nom, c\'est une arnaque : signale-le depuis la discussion dans l\'app.\n\nPour supprimer ton compte : Paramètres dans l\'app, puis « Supprimer mon compte ».':
    '{app} никогда не попросит у тебя денег в сообщении. Если кто-то просит, даже от нашего имени, это мошенничество: пожалуйся на него прямо из переписки в приложении.\n\nЧтобы удалить аккаунт: «Настройки» в приложении, затем «Удалить мой аккаунт».',
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
  "Ta personne de confiance a supprimé son compte {app}. Tu peux en désigner une autre.": "Твой доверенный человек удалил свой аккаунт {app}. Ты можешь выбрать другого.",
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
  "Tu as plu à quelqu'un à {ville}. Continue à découvrir : tu le croiseras dans ton paquet.":
    'Кому-то в городе {ville} понравилась твоя анкета. Смотри дальше: эта анкета попадётся тебе в колоде.',
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
  // Odo Plus
  "Ton pass {app} Plus est actif jusqu'au {date}.": 'Твой пропуск {app} Plus действует до {date}.',
  'Ton pass {app} Plus a été retiré.': 'Твой пропуск {app} Plus снят.',
};

const UK = {
  // Bot
  'Salut {nom}. {app} te fait rencontrer des personnes vérifiées de ta ville, sans rien te faire payer pour ça.\n\nRéservé aux 18 ans et plus.':
    'Привіт, {nom}. {app} знайомить тебе з перевіреними людьми з твого міста і нічого за це не бере.\n\nЛише від 18 років.',
  'Ouvrir {app}': 'Відкрити {app}',
  '{app} ne te demandera jamais d\'argent par message. Si quelqu\'un le fait, même en son nom, c\'est une arnaque : signale-le depuis la discussion dans l\'app.\n\nPour supprimer ton compte : Paramètres dans l\'app, puis « Supprimer mon compte ».':
    '{app} ніколи не попросить у тебе грошей у повідомленні. Якщо хтось просить, навіть від нашого імені, це шахрайство: поскаржся на нього просто з листування в застосунку.\n\nЩоб видалити акаунт: «Налаштування» у застосунку, потім «Видалити мій акаунт».',
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
  "Ta personne de confiance a supprimé son compte {app}. Tu peux en désigner une autre.": "Твоя довірена особа видалила свій акаунт {app}. Ти можеш обрати іншу.",
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
  "Tu as plu à quelqu'un à {ville}. Continue à découvrir : tu le croiseras dans ton paquet.":
    'Комусь у місті {ville} сподобалася твоя анкета. Дивись далі: ця анкета трапиться тобі в колоді.',
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
  // Odo Plus
  "Ton pass {app} Plus est actif jusqu'au {date}.": 'Твій пропуск {app} Plus діє до {date}.',
  'Ton pass {app} Plus a été retiré.': 'Твій пропуск {app} Plus знято.',
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
