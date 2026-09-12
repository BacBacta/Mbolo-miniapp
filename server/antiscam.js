import { config } from './config.js';

// Filtre anti-arnaque. Deux erreurs coûtent cher, et pas de la même façon :
// un faux négatif laisse passer une arnaque, un faux positif tue une conversation ordinaire.
// Mesuré sur l'ancienne version : « ça me coûte 300 F pour venir », « j'ai plus de crédit » et
// « les frais de scolarité » étaient bloqués, tandis que « envoie juste 10k », « il faut
// 50 mille » et « achète-moi une carte de recharge » passaient.
//
// D'où la règle : un mot d'argent ne bloque jamais seul. Il faut un moyen de paiement nommé,
// ou une demande, c'est-à-dire un verbe de transfert ou un besoin, avec un montant ou un objet
// d'argent. Parler d'argent reste possible ; en demander, non.
//
// Depuis l'ouverture à tous les pays, les règles ne visent plus le seul Cameroun : numéros de
// n'importe quel indicatif, moyens de paiement d'Afrique, d'Europe, d'Asie et des diasporas, et
// les mêmes tournures en anglais qu'en français. Le français et l'anglais sont traités ensemble
// dans les mêmes expressions : une personne qui lit en anglais peut très bien écrire en français,
// et une arnaque ne choisit pas la langue de sa cible.

const normalize = (t) =>
  t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/0/g, 'o')
    .replace(/[.\-_*]/g, '');

// ------------------------------------------------------------------
// 1. Moyens de paiement et valeurs transférables
// Les nommer suffit : il n'y a pas d'usage innocent de « envoie sur mon Orange Money » dans une
// discussion de rencontre. N'entrent ici que les noms sans autre sens courant ; les mots à double
// sens sont plus bas, dans MOYENS_AMBIGUS.
// ------------------------------------------------------------------
const MOYENS = [
  // Mobile money : Afrique de l'Ouest, centrale, de l'Est et australe
  /\bmomo\b/,
  /mobile ?money/,
  /\b(orange|mtn|airtel|moov|tigo|vodacom|safaricom|halo) ?money\b/,
  /\borange ?cash\b/,
  /\bm ?pesa\b/,
  /\b(flooz|wari|djamo|tmoney|mvola|ecocash|telebirr|opay|palmpay|moniepoint|kuda|chipper|zaad|sahal)\b/,
  /\bevc ?plus\b/,
  // Transfert international et diasporas
  /\bwestern ?union\b/,
  /\b(moneygram|worldremit|remitly|taptap ?send|sendwave|azimo|xoom)\b/,
  /\bria ?(money|transfer)\b/,
  // Portefeuilles et virements
  /\b(paypal|zelle|venmo|revolut|skrill|payoneer|neteller|monzo|n26)\b/,
  /\bcash ?app\b/,
  /\b(paytm|phonepe|gpay|google ?pay|apple ?pay|samsung ?pay|bkash|nagad|easypaisa|jazzcash|alipay)\b/,
  /\bwechat ?pay\b|\bweixin ?pay\b|\bupi\b/,   // « we chat pay » attraperait « when we chat pay attention »
  /\b(interac|bizum|swish|mobilepay|vipps|twint|satispay|blik)\b/,
  /\bmb ?way\b/,
  // Coordonnées bancaires
  /\brib\b/,
  /\biban\b/,
  /\bswift ?(code|bic)\b/,
  /\b(sepa|sort ?code|routing ?number)\b/,
  /\bcode (secret|pin)\b/,
  /\bpin ?code\b/,
  // Cartes : la carte cadeau est un classique de l'arnaque. « visa » est plus bas, avec les
  // moyens ambigus : c'est aussi le document de voyage, et on en parle beaucoup.
  /\b(mastercard|amex|american ?express)\b/,
  /\b(carte|cartes) ?cadeaux?\b/,
  /\bgift ?cards?\b/,
  /\b(steam|itunes|google ?play|amazon|netflix) ?(card|gift|code)\b/,
  // Crypto : zone grise réglementaire dans la CEMAC, et rail d'arnaque courant
  /\b(usdt|usdc|bitcoin|btc|ethereum|eth|binance|crypto|blockchain|metamask|trust ?wallet)\b/,
];

// Moyens dont le nom a un autre sens courant. Ils ne bloquent jamais seuls : ils comptent comme
// un objet d'argent, donc il faut un verbe de transfert ou un besoin à côté.
// Deux cas précis motivent ce palier. L'une des questions de profil est « Je supporte », et
// « je supporte l'OM » n'est pas une demande d'argent — « envoie sur mon om », si. Et « visa »
// désigne aussi le document de voyage : dans une app ouverte à tous les pays, « j'ai eu mon
// visa » revient sans arrêt, alors que « aide-moi pour mon visa » reste bloqué, parce qu'un
// moyen ambigu tient le rôle de l'objet d'argent dès qu'un besoin ou un verbe l'accompagne.
// « pix » (Brésil) a été retiré : « send me pix » veut dire « envoie des photos ».
const MOYENS_AMBIGUS = [
  /\bom\b/,
  /\bvisa\b/,
  /\bwave\b/,
  /\bwise\b/,
  /\bcash ?out\b/,
  /\b(wallet|portefeuille)\b/,
];

// ------------------------------------------------------------------
// 2. Verbes de transfert d'argent, français et anglais.
// ------------------------------------------------------------------
const VERBE_TRANSFERT = new RegExp(
  '\\b(' + [
    // français
    'envoi?e', 'envoie?s', 'envoyer', 'donne', 'donner', 'transfer(e|er|t)?', 'verse', 'verser',
    'paie', 'payer', 'paye', 'regle', 'regler', 'achete', 'acheter', 'recharge', 'recharger',
    'rembourse', 'rembourser', 'avance', 'avancer', 'depose', 'deposer', 'crediter', 'credite',
    // anglais
    'send', 'sends', 'sending', 'transfers?', 'transferring', 'wire', 'wired', 'pay', 'pays',
    'paying', 'paid', 'buy', 'buys', 'buying', 'purchase', 'refund', 'reimburse', 'deposit',
    'top ?up', 'topup', 'forward',
  ].join('|') + ')\\b'
);

// ------------------------------------------------------------------
// 3. Verbes de dépannage : demander à être dépanné est une demande d'argent, en avoir été dépanné
// par quelqu'un d'autre n'en est pas une. D'où l'exigence d'une cible « moi ».
// ------------------------------------------------------------------
const VERBE_DEPANNAGE = /\b(depann(e|er)|pret(e|er|es)|emprunt(e|er)|lend|lends|loan|loans|borrow|borrows)\b/;
// « m » seul est exclu : dans « il m'a dépanné », la limite de mot tombe avant l'apostrophe,
// et la phrase raconte un fait passé au lieu de demander quoi que ce soit.
const CIBLE_MOI = /\b(moi|mw|me)\b/;
// Argot anglais du dépannage. « spot » et « front » sont des mots trop courants pour entrer dans
// VERBE_DEPANNAGE : « my favourite spot » est la traduction d'une question de profil.
const DEPANNAGE_ARGOT = /\b(spot|front|hook) ?me\b|\bhook me up\b/;

// ------------------------------------------------------------------
// 4. Expression d'un besoin.
// ------------------------------------------------------------------
const BESOIN = /\b(besoin|manque|faut|aide ?(moi|mw|me)|aidez ?moi|help ?(me|mi)?|helep|need|needs|needed|short of|broke|stuck|lack(ing)?|missing)\b/;

// ------------------------------------------------------------------
// 5. Montants : argot local (10k, 50 mille) et devises du monde entier.
// ------------------------------------------------------------------
const DEVISES = [
  'f', 'fcfa', 'francs?', 'cfa', 'xof', 'xaf', 'euros?', 'eur', '€', 'usd', 'dollars?', '\\$',
  'gbp', 'livres?', 'pounds?', '£', 'naira', '₦', 'ngn', 'cedis?', 'ghs', 'rands?', 'zar',
  'dirhams?', 'mad', 'aed', 'dh', 'dinars?', 'dzd', 'tnd', 'lyd', 'shillings?', 'kes', 'tzs',
  'ugx', 'birr', 'etb', 'kwachas?', 'zmw', 'mwk', 'leones?', 'dalasis?', 'ariary', 'mga',
  'cad', 'chf', 'aud', 'yuan', 'rmb', 'cny', 'inr', '₹', 'roupies?', 'rupees?', 'reais?', 'brl',
].join('|');
// En préfixe, on ne garde que les symboles et les codes à trois lettres : « f » devant un
// chiffre ferait de « la F1 » un montant.
const SYMBOLES = '\\$|€|£|₦|₹|usd|eur|gbp|xaf|xof|cad|chf|aud|inr|brl';
const MULTIPLICATEURS = 'k|mille|thousand|grand|millions?|milliards?|billions?|lakh|crore';
const MONTANT = new RegExp(
  `\\b\\d+ ?(${MULTIPLICATEURS})\\b` +           // 10k, 50 mille, 2 millions
  `|\\b\\d+ ?(${DEVISES})\\b` +                  // 5000 fcfa, 20 dollars, 30 €
  `|(${SYMBOLES}) ?\\d+\\b` +                    // $50, €30, ₦5000, usd 20
  `|\\b\\d{4,}\\b`,                              // une somme écrite en entier
  'i'
);

// ------------------------------------------------------------------
// 6. Objets qui valent de l'argent. Seuls, ils ne bloquent rien.
// ------------------------------------------------------------------
const OBJET_ARGENT = new RegExp(
  '\\b(' + [
    // français
    'argent', 'sous', 'cash', 'monnaie', 'unites?', 'credit', 'recharge', 'frais', 'caution',
    'douane', 'taxe', 'amende', 'facture', 'somme', 'billet', 'virement', 'carte', 'especes?',
    // anglais. Trois mots ont été écartés parce qu'ils se mordaient la queue : « transfer »,
    // « deposit » et « top up » sont déjà des verbes de transfert, donc le mot seul aurait suffi
    // à bloquer. Trois autres parce qu'ils sont trop courants dans un sens sans rapport :
    // « fine » (« I'm fine »), « balance » (« work-life balance ») et « bill », qui traduit
    // aussi bien « facture » que « l'addition » — et payer l'addition n'est pas une arnaque.
    'money', 'funds?', 'fees?', 'bail', 'customs', 'tax', 'invoice',
    'voucher', 'airtime', 'payment',
  ].join('|') + ')\\b'
);

// ------------------------------------------------------------------
// 7. Partage de contact, tous pays et toutes plateformes.
// ------------------------------------------------------------------
const CONTACT = [
  /https?:\/\//,
  /\bwww\./,
  /\bt\.me\//,
  /\bwa\.me\//,
  /@[a-z0-9_]{5,}/i,                                     // pseudo Telegram, et la plupart des e-mails
  /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i,          // adresse e-mail écrite en entier
  /\b(whatsapp|whats ?app|wassap|watsapp|wsp)\b/,
  /\b(snap|snapchat|instagram|insta|facebook|messenger|tiktok|twitter|discord|skype|viber|imo|botim|kakao|wechat|weixin|zangi)\b/,
  // « donne-moi ton contact » est la façon courante de demander un numéro en français.
  // En anglais « my contact » désigne aussi une lentille : on s'y limite au numéro et au mail.
  /\b(mon|ton) ?(mail|email|e ?mail|numero|num|contact)\b/,
  /\b(my|your) ?(mail|email|e ?mail|number|num)\b/,
];

// Numéros de téléphone, quel que soit l'indicatif. Deux contournements très répandus sont
// neutralisés avant la comparaison :
//   — les séparateurs qui coupent le numéro (« 6 77 12 34 56 », « 677.12.34.56 », « 677/12/34/56 ») ;
//   — la lettre O tapée à la place du zéro (« 6 77 12 34 5O »).
// Le O n'est converti que s'il touche un chiffre : sinon « bonjour » deviendrait « b0nj0ur », et
// une suite de o un numéro de téléphone.
const oCommeZero = (s) => {
  let out = s;
  for (let i = 0; i < 4; i += 1) out = out.replace(/(?<=\d)[oO]|[oO](?=\d)/g, '0');
  return out;
};
const collerChiffres = (s) => s.replace(/(\d)[\s.\-_()/ ]+(?=\d)/g, '$1');
// Une date ISO et une heure sont mises de côté avant le recollage : « 2026-09-12 14:30 »
// donnerait sinon une suite de dix chiffres, et un créneau de rendez-vous — champ libre, passé
// par le même filtre que les messages — serait refusé comme un numéro de téléphone.
const masquerDatesEtHeures = (s) => s
  .replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ')
  .replace(/\b\d{1,2}\s?[:h]\s?\d{2}\b/g, ' ');
const formeNumero = (brut) => collerChiffres(oCommeZero(masquerDatesEtHeures(brut)));

// Un numéro international porte « + » et 7 à 15 chiffres (norme E.164). Sans « + », il en faut
// au moins 9 : c'est la longueur d'un mobile dans la plupart des pays, et ça laisse passer une
// date écrite « 12092026 », qui n'en fait que 8.
// Limite connue : les pays à 8 chiffres (Togo, Gabon) ne sont attrapés que sous la forme « + ».
const NUMERO = /\+\d{7,15}|\b\d{9,15}\b/;

// « e n v o i e 5000 » : les lettres détachées une à une sont recollées avant comparaison.
// Il en faut au moins trois de suite, sinon « j ai » ou « l an » seraient recollés à tort.
const collerLettres = (s) => s.replace(/\b(?:[a-z] ){2,}[a-z]\b/g, (m) => m.replace(/ /g, ''));

const teste = (regles, ...textes) => (Array.isArray(regles) ? regles : [regles]).some((r) => textes.some((t) => r.test(t)));

// Renvoie la catégorie de blocage, ou null. Exportée pour les tests et la modération.
export function categorieArgent(text) {
  const n = normalize(text);
  const brut = text.toLowerCase();
  const espace = collerLettres(n);
  if (teste(MOYENS, n, brut, espace)) return 'moyen de paiement';
  // Un moyen ambigu ne bloque pas seul, mais il tient le rôle de l'objet d'argent.
  const montantOuObjet = teste(MONTANT, n, brut, espace) || teste(OBJET_ARGENT, n, brut, espace) || teste(MOYENS_AMBIGUS, n, brut, espace);
  if (teste(VERBE_TRANSFERT, n, brut, espace) && montantOuObjet) return 'demande de transfert';
  if (teste(BESOIN, n, brut, espace) && montantOuObjet) return "besoin d'argent";
  if (teste(DEPANNAGE_ARGOT, n, brut, espace)) return 'demande de dépannage';
  if (teste(VERBE_DEPANNAGE, n, brut, espace) && (teste(CIBLE_MOI, n, brut, espace) || montantOuObjet)) return 'demande de dépannage';
  return null;
}

export function checkMessage(text, messageCountInMatch, unlockAfter) {
  const categorie = categorieArgent(text);
  if (categorie) {
    return {
      ok: false,
      code: 'MONEY_BLOCKED',
      categorie,
      // Dire ce qui a déclenché le blocage : sans cela, la personne ne sait pas quoi corriger.
      message: `Les demandes et offres d'argent sont bloquées sur ${config.appName}. Ce message ressemble à une ${categorie}. Retire le montant ou le moyen de paiement, et renvoie-le.`,
    };
  }
  const n = normalize(text);
  const brut = text.toLowerCase();
  if (messageCountInMatch < unlockAfter && (teste(CONTACT, brut, n) || teste(NUMERO, formeNumero(brut)))) {
    return {
      ok: false,
      code: 'CONTACT_TOO_EARLY',
      categorie: 'contact',
      message: `Les liens, numéros et pseudos sont débloqués après ${unlockAfter} messages échangés de chaque côté.`,
    };
  }
  return { ok: true };
}
