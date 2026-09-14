import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMessage } from '../server/antiscam.js';

const blocked = (t, n = 20) => checkMessage(t, n, 10).code;

test('bloque les demandes d\'argent, même déguisées', () => {
  for (const t of ['Envoie-moi 5000 F par MoMo', 'fais un transfert OM stp', 'M.o.M.o urgent', 'j\'ai besoin de 10 000 fcfa', 'aide moi pour mon visa', 'paye en usdt']) {
    assert.equal(blocked(t), 'MONEY_BLOCKED', t);
  }
});

test('bloque numéros et liens au début de la discussion seulement', () => {
  assert.equal(blocked('mon numéro 6 77 12 34 56', 2), 'CONTACT_TOO_EARLY');
  assert.equal(blocked('ajoute moi sur whatsapp', 2), 'CONTACT_TOO_EARLY');
  assert.equal(blocked('https://exemple.com', 2), 'CONTACT_TOO_EARLY');
  assert.equal(checkMessage('mon numéro 677123456', 12, 10).ok, true);
});

test('laisse passer les messages normaux', () => {
  for (const t of ['Salut, ton ndolé a l\'air bon', 'On se voit samedi à 16 h ?', 'Tu es plutôt Bastos ou Essos ?']) {
    assert.equal(checkMessage(t, 0, 10).ok, true, t);
  }
});

// Corpus de non-régression. Il mesure la cohérence entre les règles et les phrases que j'ai
// écrites, pas le comportement de vrais utilisateurs : l'audit a montré que deux corpus écrits
// à la main donnaient des taux différents d'un facteur 2,8. Sa valeur est de figer chaque cas
// nommé, pour qu'aucun ne reparte en arrière. Il est à remplacer par les messages réellement
// signalés pendant la bêta.
const LEGITIMES = [
  'Salut, ça va ? Tu fais quoi ce weekend ?',
  'Je prends le taxi, ça me coûte 300 F pour venir',
  'Je fais un crédit pour ma moto, galère',
  'Les frais de scolarité sont chers cette année',
  "J'ai plus de crédit sur mon téléphone",
  'Mon oncle m a dépanné pour le déménagement',
  'Envoie-moi une photo de ton chien',
  'La carte du restaurant est bien',
  'Je viens en moto, 500 F depuis Essos',
  'Le concert coûte 2000 francs',
  'Ma sœur travaille à la douane',
  'On partage l addition, ça te va ?',
];
const ARNAQUES = [
  'Envoie moi 5000 F par MoMo stp',
  'Tu peux me dépanner un peu ?',
  'Envoie sur mon Orange Money',
  'Je te rembourse demain juré, envoie juste 10k',
  'Achete moi une carte de recharge',
  'Mon papa est malade il faut 50 mille',
  'paie juste la douane et je viens',
  'Small small helep me, even 2000 na ok',
  'envoie des unités sur ce numéro',
  'tu peux me prêter 20 mille ?',
  'verse sur mon compte, je te donne le RIB',
  'il me manque 15k pour le transport',
  'recharge moi 1000 F',
];

test('parler d\'argent reste possible : aucun de ces messages n\'est bloqué', () => {
  for (const m of LEGITIMES) assert.equal(checkMessage(m, 20, 10).ok, true, m);
});

test('en demander ne l\'est pas : chacun de ces messages est bloqué', () => {
  for (const m of ARNAQUES) assert.equal(checkMessage(m, 20, 10).code, 'MONEY_BLOCKED', m);
});

test('le message de blocage nomme ce qui l\'a déclenché', () => {
  const r = checkMessage('Envoie moi 5000 F par MoMo', 20, 10);
  assert.equal(r.categorie, 'moyen de paiement');
  assert.match(r.message, /moyen de paiement/);
  assert.ok(!r.message.includes('!'), 'aucun point d\'exclamation dans les messages système');
});

// ==================================================================
// Ouverture internationale
//
// Le filtre ne visait que le Cameroun : préfixe +237, mobiles à 9 chiffres commençant par 6,
// MTN MoMo et Orange Money, montants en F CFA, vocabulaire français. Un numéro nigérian, un
// compte M-Pesa ou une demande écrite en anglais passaient sans être vus.
// ==================================================================

const NUMEROS = [
  ['+234 803 123 4567', 'Nigeria, forme internationale'],
  ['+254 712 345678', 'Kenya'],
  ['+33 6 12 34 56 78', 'France'],
  ['+1 415 555 0123', 'États-Unis'],
  ['08031234567', 'Nigeria, forme nationale'],
  ['0712345678', 'Kenya, forme nationale'],
  ['677.12.34.56', 'Cameroun, séparé par des points'],
  ['6 77 12 34 5O', 'la lettre O tapée à la place du zéro'],
  ['+237677123456', 'Cameroun, collé'],
  ['mon num 07 51 22 33 44', 'annoncé en toutes lettres'],
  ['call 415-555-0123', 'séparé par des tirets'],
];

test('un numéro de téléphone est vu quel que soit son indicatif', () => {
  for (const [numero, pourquoi] of NUMEROS) {
    assert.equal(checkMessage(numero, 2, 10).code, 'CONTACT_TOO_EARLY', `${pourquoi} : ${numero}`);
  }
  // Après le déblocage, ils passent tous : la règle retarde le partage, elle ne l'interdit pas
  for (const [numero] of NUMEROS) assert.equal(checkMessage(numero, 12, 10).ok, true, numero);
});

test('une date, une heure ou un prix ne sont pas des numéros de téléphone', () => {
  // Le seuil est à neuf chiffres pour cette raison : « 12-09-2026 » n'en fait que huit.
  for (const t of ['On se voit le 12-09-2026', 'J ai 25 ans', 'rendez-vous à 16 h 30', 'Le concert coûte 2000 francs', 'il y avait 1 000 000 de fans', 'je suis né en 1998']) {
    assert.equal(checkMessage(t, 2, 10).ok, true, t);
  }
});

const ARNAQUES_INTERNATIONALES = [
  'send it on M-Pesa',
  'envoie sur mon wave',
  'my zelle is ready',
  'pay with cashapp',
  'buy me a steam card',
  'I need 200 dollars',
  'send me 50 euros',
  'transfer 5000 naira',
  'here is my iban',
  'airtel money please',
  'send me a google play code',
  'I need 20k for my rent',
  'can you lend me some money',
  'my mum is sick, we need $500',
  'send it to my trust wallet',
  'just 10 pounds, I will refund you',
  'top up my airtime',
  'envoie 3000 par moov money',
  'I need money for the customs fee',
  'bkash 2000 taka',
];

test('une demande d\'argent est bloquée quels que soient la langue et le moyen de paiement', () => {
  for (const m of ARNAQUES_INTERNATIONALES) assert.equal(checkMessage(m, 20, 10).code, 'MONEY_BLOCKED', m);
});

// Le vrai risque n'est pas de rater une arnaque : c'est de tuer une conversation ordinaire.
// Ce corpus grandit avec les règles — toute règle ajoutée doit le laisser intact.
const LEGITIMES_INTERNATIONAUX = [
  'Hi, how are you? What are you doing this weekend?',
  'Send me a photo of your dog',
  'I take a taxi, it costs me 300 F to come',
  'My favourite spot is the lake at sunset',
  'Let us split the bill',
  'The wave was huge at the beach',
  'I am broke this month, staying home',
  'I paid for my studies myself',
  'My sister works at customs',
  'I need a coffee',
  'Do you have credit on your phone?',
  'That is fine with me',
  'I am missing the bus',
  'I work in a bank',
  'I lost my wallet yesterday',
  'I am stuck in traffic',
  'I have been wise about it',
  'I study economics and finance',
  'My brother borrowed my charger',
  'She lent her sister a dress',
  'I need work-life balance',
  'I got a transfer to another school',
  'I paid a deposit for the flat',
  'Can I borrow my brother\'s car?',
  'J ai besoin de regarder la F1',
  'J ai perdu mon portefeuille hier',
  'Je suis coincé dans les embouteillages',
  'Ma sœur m a prêté sa robe',
  // « visa » est aussi le document de voyage, et dans une app ouverte à tous les pays on en parle
  'J ai enfin eu mon visa pour la France',
  'mon visa étudiant est arrivé',
  // « pix » veut dire « photos » en argot anglais bien plus souvent que le virement brésilien
  'send me pix',
  // Mots courants qui frôlaient une règle : « we chat » n'est pas WeChat, « my contact » peut
  // être une lentille, et « the bill » l'addition.
  'when we chat pay attention to the details',
  'I lost my contact lens',
  'can we chat later?',
];

test('une conversation ordinaire n\'est jamais bloquée, en français comme en anglais', () => {
  for (const m of LEGITIMES_INTERNATIONAUX) assert.equal(checkMessage(m, 20, 10).ok, true, m);
});

test('« OM » ne bloque plus une conversation de football', () => {
  // L'une des questions de profil est « Je supporte » : « je supporte l'OM » était bloqué comme
  // moyen de paiement. Un moyen ambigu ne bloque plus seul, mais tient le rôle d'objet d'argent.
  assert.equal(checkMessage('Je supporte l\'OM depuis toujours', 20, 10).ok, true);
  assert.equal(checkMessage('I support OM', 20, 10).ok, true);
  assert.equal(checkMessage('envoie sur mon om', 20, 10).code, 'MONEY_BLOCKED', 'le sens « Orange Money » reste bloqué');
});

test('un créneau de rendez-vous n\'est pas pris pour un numéro', () => {
  // Le créneau est un champ libre passé par le même filtre que les messages. Une date ISO suivie
  // d'une heure donnait une suite de dix chiffres, donc une proposition de rendez-vous refusée.
  for (const t of ['Samedi 14 h 30', 'Demain, 16 h', 'le 12/09/2026 à 16h', '2026-09-12 14:30', 'Saturday 2 pm', 'vendredi 19:00']) {
    assert.equal(checkMessage(t, 0, 10).ok, true, t);
  }
});

test('« visa » laisse parler du document de voyage, pas de la carte', () => {
  assert.equal(checkMessage('J ai enfin eu mon visa pour la France', 20, 10).ok, true);
  // Mais la demande d'aide pour des frais de visa reste bloquée, comme avant
  assert.equal(checkMessage('aide moi pour mon visa', 20, 10).code, 'MONEY_BLOCKED');
  assert.equal(checkMessage('envoie sur ma visa', 20, 10).code, 'MONEY_BLOCKED');
});

test('les contournements d\'écriture ne servent à rien', () => {
  const evasions = [
    ['M.o.M.o urgent', 'MONEY_BLOCKED'],
    ['O.r.a.n.g.e M.o.n.e.y', 'MONEY_BLOCKED'],
    ['envoie 5.0.0.0 f', 'MONEY_BLOCKED'],
    ['s e n d 5000', 'MONEY_BLOCKED'],
    ['e n v o i e 10k', 'MONEY_BLOCKED'],
    ['TRANSFÈRE 10K', 'MONEY_BLOCKED'],
    ['ajoute-moi sur W-h-a-t-s-A-p-p', 'CONTACT_TOO_EARLY'],
    ['ecris moi sur jean.dupont@gmail.com', 'CONTACT_TOO_EARLY'],
    ['my number: +237 6 77 12 34 56', 'CONTACT_TOO_EARLY'],
  ];
  for (const [texte, code] of evasions) assert.equal(checkMessage(texte, 2, 10).code, code, texte);
});

test('recoller les lettres ne recolle pas le français ordinaire', () => {
  // Il faut trois lettres détachées de suite : « j ai » et « l an » restent intacts.
  for (const t of ['j ai vu ce film', 'l an dernier à Kribi', 'c est a moi de jouer']) {
    assert.equal(checkMessage(t, 20, 10).ok, true, t);
  }
});

// ==================================================================
// Ce que la revue du 14 septembre 2026 a fait passer (audit/09-revue-code.md, I15) : des messages
// ordinaires, en français, que la règle visait et manquait. Chaque ligne a été rejouée contre
// l'ancienne version avant d'être corrigée : toutes passaient.
// ==================================================================

const ARNAQUES_MANQUEES = [
  // le tiret était supprimé au lieu d'être remplacé : « prête-moi » devenait « pretemoi »
  'prête-moi 5000', 'dépanne-moi de 5k', 'dépanne-moi',
  // l'apostrophe omise colle les mots, comme en SMS
  'jai besoin dargent', 'besoin dargent stp',
  // « m'aider » n'était pas un besoin
  "tu peux m'aider avec 5000 fcfa", 'tu peux m aider avec 5000',
  // les montants espacés : « 5 000 » n'avait pas quatre chiffres collés
  'envoie 5 000', 'envoie 5.000', 'envoie 5,000', 'besoin de 10 000',
  // verbes absents
  'tu me donnes 5000', 'envoyez 5000', 'vire moi 5000', 'offre moi 5000', 'gimme 5k', 'dash me 5k', 'bless me with 5k',
  // unicode : cyrillique qui ressemble au latin, largeur nulle, pleine largeur, chiffres emoji
  'еnvоiе-mоi 5k', 'en​voie-moi 5​k', 'envoie-moi ５０００ fcfa', 'envoie 5️⃣0️⃣0️⃣0️⃣ f',
];

test("les demandes d'argent que la revue a fait passer sont bloquées", () => {
  for (const m of ARNAQUES_MANQUEES) assert.equal(checkMessage(m, 20, 10).code, 'MONEY_BLOCKED', m);
});

const CONTACTS_MANQUES = [
  'je suis sur wa', 'mon wa', 'tu as mon ig ?', 'mon ig c handle', 'mon tg', 'ton tel', 'ton phone', 'ur number',
  'text me', 'dm me', 'appelle-moi au', 'tes coordonnées', 'whatsap ?', 'wtsp', 'wapp',
  't . me / handle', 'telegram.me/handle', 'bit.ly/abc', 'monsite.cm/profil', 'moi at gmail dot com',
  '６７７１２３４５６', '6​7​7​1​2​3​4​5​6', '6️⃣7️⃣7️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣', '677l23456',
];

test('les partages de contact que la revue a fait passer sont retenus avant dix messages', () => {
  for (const m of CONTACTS_MANQUES) assert.equal(checkMessage(m, 2, 10).code, 'CONTACT_TOO_EARLY', m);
  for (const m of CONTACTS_MANQUES) assert.equal(checkMessage(m, 12, 10).ok, true, `${m} : débloqué après dix messages`);
});

// Chaque règle ajoutée ci-dessus a son revers : le mot court qui a un autre sens.
test('les nouvelles règles laissent passer le français et l\'anglais ordinaires', () => {
  for (const t of [
    'un homme tel que toi', 't me plais grave', 'on se voit samedi, envoie une photo', 'je suis sur la route',
    'prête attention à toi', 'mon oncle m a prêté sa voiture', 'on y va par le bus', 'je passe par la poste',
    'call me maybe', 'je suis né en 1998', 'le 12/09/2026 à 16h', 'j ai eu 15 000 vues sur ma vidéo',
    'on est 5 000 à la fac', 'Wa, tu es belle', 'je fais du sport le samedi',
  ]) {
    assert.equal(checkMessage(t, 2, 10).ok, true, t);
  }
});
