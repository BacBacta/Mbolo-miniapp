// Géographie : pays et ville. L'app n'est plus liée à un seul pays.
//
// Deux principes.
//
// 1. Les noms de pays ne sont pas traduits à la main : Intl.DisplayNames les donne dans la langue
//    de la personne, sur le serveur comme dans le navigateur. On ne stocke donc que le code ISO.
// 2. La ville est un champ libre, parce qu'aucune liste ne couvrira jamais le monde. Pour que
//    « Yaoundé », « Yaounde » et « YAOUNDE » se rejoignent quand même dans la découverte, la
//    comparaison passe par une clé normalisée, jamais par le texte affiché.

// Codes ISO 3166-1 alpha-2. Liste des États et territoires ayant une population résidente.
const CODES = `
AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW
BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES
ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL
IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR
NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK
SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC
VE VG VI VN VU WF WS YE YT ZA ZM ZW
`.trim().split(/\s+/);

export const COUNTRY_CODES = CODES;

// Les 54 États d'Afrique, plus le Sahara occidental. Une liste fermée, lue par le mot « afrique »
// de PLUS_SANS_VENTE_PAYS (server/plus.js) : là où le pass n'est pas vendu, ce qu'il ouvre est
// offert. Les territoires européens du continent (La Réunion, Mayotte, Sainte-Hélène) n'y sont
// pas : leur pouvoir d'achat n'est pas celui que la liste vise.
export const AFRIQUE = `
DZ AO BJ BW BF BI CM CV CF TD KM CG CD CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR
MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW EH
`.trim().split(/\s+/);
const VALIDES = new Set(CODES);
export const estPays = (code) => VALIDES.has(String(code || '').toUpperCase());

// Nom du pays dans la langue demandée, avec repli sur le code si la plateforme ne connaît pas
// la langue. Mémorisé : Intl.DisplayNames coûte cher à construire.
const noms = new Map();
export function nomPays(code, lang = 'fr') {
  const c = String(code || '').toUpperCase();
  if (!VALIDES.has(c)) return '';
  const cle = `${lang}:${c}`;
  if (noms.has(cle)) return noms.get(cle);
  let nom = c;
  try {
    nom = new Intl.DisplayNames([lang], { type: 'region' }).of(c) || c;
  } catch {
    /* langue inconnue de la plateforme : on garde le code */
  }
  noms.set(cle, nom);
  return nom;
}

// Liste triée pour les menus déroulants, dans la langue de la personne.
export function listePays(lang = 'fr') {
  const collator = new Intl.Collator(lang, { sensitivity: 'base' });
  return CODES.map((code) => ({ code, name: nomPays(code, lang) })).sort((a, b) => collator.compare(a.name, b.name));
}

// Clé de comparaison d'une ville : accents, casse, ponctuation et espaces multiples effacés.
// « Yaoundé », « yaounde » et « YAOUNDE  » donnent la même clé, donc le même vivier.
export const cleVille = (nom) =>
  String(nom || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Mise en forme d'un nom de ville saisi librement : première lettre de chaque mot en capitale.
// « yaounde » devient « Yaounde », « SAINT-LOUIS » devient « Saint-Louis ». La comparaison, elle,
// continue de passer par cleVille : cette mise en forme ne sert qu'à l'affichage.
export const villeAffichee = (nom) =>
  String(nom || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('fr')
    .replace(/(^|[\s'’\-])([\p{L}])/gu, (_, avant, lettre) => avant + lettre.toLocaleUpperCase('fr'));

// Suggestions de villes, proposées pendant la saisie. Ce n'est pas une limite : n'importe quelle
// ville peut être écrite. La liste sert à éviter les fautes de frappe qui fragmentent le vivier.
export const VILLES_CONNUES = {
  CM: ['Yaoundé', 'Douala', 'Bafoussam', 'Bamenda', 'Buea', 'Garoua', 'Maroua', 'Ngaoundéré', 'Bertoua', 'Ebolowa', 'Kribi', 'Limbe', 'Edéa', 'Kumba', 'Dschang'],
  CI: ['Abidjan', 'Bouaké', 'Yamoussoukro', 'Daloa', 'San-Pédro', 'Korhogo'],
  SN: ['Dakar', 'Thiès', 'Touba', 'Saint-Louis', 'Ziguinchor', 'Mbour'],
  CD: ['Kinshasa', 'Lubumbashi', 'Goma', 'Bukavu', 'Kisangani', 'Matadi'],
  CG: ['Brazzaville', 'Pointe-Noire', 'Dolisie'],
  GA: ['Libreville', 'Port-Gentil', 'Franceville'],
  BJ: ['Cotonou', 'Porto-Novo', 'Parakou', 'Abomey-Calavi'],
  TG: ['Lomé', 'Sokodé', 'Kara'],
  BF: ['Ouagadougou', 'Bobo-Dioulasso', 'Koudougou'],
  ML: ['Bamako', 'Sikasso', 'Mopti', 'Ségou'],
  NE: ['Niamey', 'Zinder', 'Maradi'],
  TD: ["N'Djaména", 'Moundou', 'Sarh'],
  GN: ['Conakry', 'Nzérékoré', 'Kankan'],
  RW: ['Kigali', 'Butare', 'Gisenyi'],
  BI: ['Bujumbura', 'Gitega'],
  MG: ['Antananarivo', 'Toamasina', 'Mahajanga'],
  MA: ['Casablanca', 'Rabat', 'Marrakech', 'Fès', 'Tanger', 'Agadir'],
  DZ: ['Alger', 'Oran', 'Constantine', 'Annaba'],
  TN: ['Tunis', 'Sfax', 'Sousse'],
  NG: ['Lagos', 'Abuja', 'Port Harcourt', 'Kano', 'Ibadan'],
  GH: ['Accra', 'Kumasi', 'Takoradi', 'Tamale'],
  KE: ['Nairobi', 'Mombasa', 'Kisumu', 'Nakuru'],
  ZA: ['Johannesburg', 'Le Cap', 'Durban', 'Pretoria'],
  FR: ['Paris', 'Marseille', 'Lyon', 'Toulouse', 'Lille', 'Bordeaux', 'Nantes', 'Montpellier', 'Strasbourg'],
  BE: ['Bruxelles', 'Anvers', 'Liège', 'Charleroi'],
  CH: ['Genève', 'Lausanne', 'Zurich', 'Berne'],
  CA: ['Montréal', 'Toronto', 'Ottawa', 'Québec', 'Vancouver'],
  US: ['New York', 'Washington', 'Atlanta', 'Houston', 'Chicago', 'Los Angeles'],
  GB: ['Londres', 'Birmingham', 'Manchester', 'Leeds'],
  DE: ['Berlin', 'Hambourg', 'Munich', 'Cologne', 'Francfort'],
  IT: ['Rome', 'Milan', 'Naples', 'Turin'],
  ES: ['Madrid', 'Barcelone', 'Valence', 'Séville'],
  PT: ['Lisbonne', 'Porto'],
};
export const villesConnues = (code) => VILLES_CONNUES[String(code || '').toUpperCase()] || [];

// ============================================================
// Fuseau horaire → pays
//
// Le navigateur connaît son fuseau sans rien demander à personne : pas de permission, pas de GPS,
// pas de service externe, pas de requête en plus. La précision s'arrête au pays, ce qui suffit
// pour préremplir le menu — la ville, elle, reste écrite par la personne.
//
// Table dérivée de zone.tab (tzdata, domaine public) : un pays par fuseau, 418 fuseaux, 247 pays.
// Elle vit côté serveur : le navigateur n'envoie que son fuseau et reçoit un code à deux lettres.
const FUSEAUX =
  'AD:Europe/Andorra AE:Asia/Dubai AF:Asia/Kabul AG:America/Antigua AI:America/Anguilla AL:Europe/Tirane ' +
  'AM:Asia/Yerevan AO:Africa/Luanda ' +
  'AQ:Antarctica/Casey|Antarctica/Davis|Antarctica/DumontDUrville|Antarctica/Mawson|Antarctica/McMurdo|Antarctica/Palmer|Antarctica/Rothera|Antarctica/Syowa|Antarctica/Troll|Antarctica/Vostok ' +
  'AR:America/Argentina/Buenos_Aires|America/Argentina/Catamarca|America/Argentina/Cordoba|America/Argentina/Jujuy|America/Argentina/La_Rioja|America/Argentina/Mendoza|America/Argentina/Rio_Gallegos|America/Argentina/Salta|America/Argentina/San_Juan|America/Argentina/San_Luis|America/Argentina/Tucuman|America/Argentina/Ushuaia ' +
  'AS:Pacific/Pago_Pago AT:Europe/Vienna ' +
  'AU:Antarctica/Macquarie|Australia/Adelaide|Australia/Brisbane|Australia/Broken_Hill|Australia/Darwin|Australia/Eucla|Australia/Hobart|Australia/Lindeman|Australia/Lord_Howe|Australia/Melbourne|Australia/Perth|Australia/Sydney ' +
  'AW:America/Aruba AX:Europe/Mariehamn AZ:Asia/Baku BA:Europe/Sarajevo BB:America/Barbados BD:Asia/Dhaka ' +
  'BE:Europe/Brussels BF:Africa/Ouagadougou BG:Europe/Sofia BH:Asia/Bahrain BI:Africa/Bujumbura ' +
  'BJ:Africa/Porto-Novo BL:America/St_Barthelemy BM:Atlantic/Bermuda BN:Asia/Brunei BO:America/La_Paz ' +
  'BQ:America/Kralendijk ' +
  'BR:America/Araguaina|America/Bahia|America/Belem|America/Boa_Vista|America/Campo_Grande|America/Cuiaba|America/Eirunepe|America/Fortaleza|America/Maceio|America/Manaus|America/Noronha|America/Porto_Velho|America/Recife|America/Rio_Branco|America/Santarem|America/Sao_Paulo ' +
  'BS:America/Nassau BT:Asia/Thimphu BW:Africa/Gaborone BY:Europe/Minsk BZ:America/Belize ' +
  'CA:America/Atikokan|America/Blanc-Sablon|America/Cambridge_Bay|America/Creston|America/Dawson|America/Dawson_Creek|America/Edmonton|America/Fort_Nelson|America/Glace_Bay|America/Goose_Bay|America/Halifax|America/Inuvik|America/Iqaluit|America/Moncton|America/Rankin_Inlet|America/Regina|America/Resolute|America/St_Johns|America/Swift_Current|America/Toronto|America/Vancouver|America/Whitehorse|America/Winnipeg ' +
  'CC:Indian/Cocos CD:Africa/Kinshasa|Africa/Lubumbashi CF:Africa/Bangui CG:Africa/Brazzaville ' +
  'CH:Europe/Zurich CI:Africa/Abidjan CK:Pacific/Rarotonga ' +
  'CL:America/Coyhaique|America/Punta_Arenas|America/Santiago|Pacific/Easter CM:Africa/Douala ' +
  'CN:Asia/Shanghai|Asia/Urumqi CO:America/Bogota CR:America/Costa_Rica CU:America/Havana ' +
  'CV:Atlantic/Cape_Verde CW:America/Curacao CX:Indian/Christmas CY:Asia/Famagusta|Asia/Nicosia ' +
  'CZ:Europe/Prague DE:Europe/Berlin|Europe/Busingen DJ:Africa/Djibouti DK:Europe/Copenhagen ' +
  'DM:America/Dominica DO:America/Santo_Domingo DZ:Africa/Algiers EC:America/Guayaquil|Pacific/Galapagos ' +
  'EE:Europe/Tallinn EG:Africa/Cairo EH:Africa/El_Aaiun ER:Africa/Asmara ' +
  'ES:Africa/Ceuta|Atlantic/Canary|Europe/Madrid ET:Africa/Addis_Ababa FI:Europe/Helsinki FJ:Pacific/Fiji ' +
  'FK:Atlantic/Stanley FM:Pacific/Chuuk|Pacific/Kosrae|Pacific/Pohnpei FO:Atlantic/Faroe FR:Europe/Paris ' +
  'GA:Africa/Libreville GB:Europe/London GD:America/Grenada GE:Asia/Tbilisi GF:America/Cayenne ' +
  'GG:Europe/Guernsey GH:Africa/Accra GI:Europe/Gibraltar ' +
  'GL:America/Danmarkshavn|America/Nuuk|America/Scoresbysund|America/Thule GM:Africa/Banjul ' +
  'GN:Africa/Conakry GP:America/Guadeloupe GQ:Africa/Malabo GR:Europe/Athens GS:Atlantic/South_Georgia ' +
  'GT:America/Guatemala GU:Pacific/Guam GW:Africa/Bissau GY:America/Guyana HK:Asia/Hong_Kong ' +
  'HN:America/Tegucigalpa HR:Europe/Zagreb HT:America/Port-au-Prince HU:Europe/Budapest ' +
  'ID:Asia/Jakarta|Asia/Jayapura|Asia/Makassar|Asia/Pontianak IE:Europe/Dublin IL:Asia/Jerusalem ' +
  'IM:Europe/Isle_of_Man IN:Asia/Kolkata IO:Indian/Chagos IQ:Asia/Baghdad IR:Asia/Tehran ' +
  'IS:Atlantic/Reykjavik IT:Europe/Rome JE:Europe/Jersey JM:America/Jamaica JO:Asia/Amman JP:Asia/Tokyo ' +
  'KE:Africa/Nairobi KG:Asia/Bishkek KH:Asia/Phnom_Penh KI:Pacific/Kanton|Pacific/Kiritimati|Pacific/Tarawa ' +
  'KM:Indian/Comoro KN:America/St_Kitts KP:Asia/Pyongyang KR:Asia/Seoul KW:Asia/Kuwait KY:America/Cayman ' +
  'KZ:Asia/Almaty|Asia/Aqtau|Asia/Aqtobe|Asia/Atyrau|Asia/Oral|Asia/Qostanay|Asia/Qyzylorda ' +
  'LA:Asia/Vientiane LB:Asia/Beirut LC:America/St_Lucia LI:Europe/Vaduz LK:Asia/Colombo LR:Africa/Monrovia ' +
  'LS:Africa/Maseru LT:Europe/Vilnius LU:Europe/Luxembourg LV:Europe/Riga LY:Africa/Tripoli ' +
  'MA:Africa/Casablanca MC:Europe/Monaco MD:Europe/Chisinau ME:Europe/Podgorica MF:America/Marigot ' +
  'MG:Indian/Antananarivo MH:Pacific/Kwajalein|Pacific/Majuro MK:Europe/Skopje ML:Africa/Bamako ' +
  'MM:Asia/Yangon MN:Asia/Hovd|Asia/Ulaanbaatar MO:Asia/Macau MP:Pacific/Saipan MQ:America/Martinique ' +
  'MR:Africa/Nouakchott MS:America/Montserrat MT:Europe/Malta MU:Indian/Mauritius MV:Indian/Maldives ' +
  'MW:Africa/Blantyre ' +
  'MX:America/Bahia_Banderas|America/Cancun|America/Chihuahua|America/Ciudad_Juarez|America/Hermosillo|America/Matamoros|America/Mazatlan|America/Merida|America/Mexico_City|America/Monterrey|America/Ojinaga|America/Tijuana ' +
  'MY:Asia/Kuala_Lumpur|Asia/Kuching MZ:Africa/Maputo NA:Africa/Windhoek NC:Pacific/Noumea NE:Africa/Niamey ' +
  'NF:Pacific/Norfolk NG:Africa/Lagos NI:America/Managua NL:Europe/Amsterdam NO:Europe/Oslo ' +
  'NP:Asia/Kathmandu NR:Pacific/Nauru NU:Pacific/Niue NZ:Pacific/Auckland|Pacific/Chatham OM:Asia/Muscat ' +
  'PA:America/Panama PE:America/Lima PF:Pacific/Gambier|Pacific/Marquesas|Pacific/Tahiti ' +
  'PG:Pacific/Bougainville|Pacific/Port_Moresby PH:Asia/Manila PK:Asia/Karachi PL:Europe/Warsaw ' +
  'PM:America/Miquelon PN:Pacific/Pitcairn PR:America/Puerto_Rico PS:Asia/Gaza|Asia/Hebron ' +
  'PT:Atlantic/Azores|Atlantic/Madeira|Europe/Lisbon PW:Pacific/Palau PY:America/Asuncion QA:Asia/Qatar ' +
  'RE:Indian/Reunion RO:Europe/Bucharest RS:Europe/Belgrade ' +
  'RU:Asia/Anadyr|Asia/Barnaul|Asia/Chita|Asia/Irkutsk|Asia/Kamchatka|Asia/Khandyga|Asia/Krasnoyarsk|Asia/Magadan|Asia/Novokuznetsk|Asia/Novosibirsk|Asia/Omsk|Asia/Sakhalin|Asia/Srednekolymsk|Asia/Tomsk|Asia/Ust-Nera|Asia/Vladivostok|Asia/Yakutsk|Asia/Yekaterinburg|Europe/Astrakhan|Europe/Kaliningrad|Europe/Kirov|Europe/Moscow|Europe/Samara|Europe/Saratov|Europe/Ulyanovsk|Europe/Volgograd ' +
  'RW:Africa/Kigali SA:Asia/Riyadh SB:Pacific/Guadalcanal SC:Indian/Mahe SD:Africa/Khartoum ' +
  'SE:Europe/Stockholm SG:Asia/Singapore SH:Atlantic/St_Helena SI:Europe/Ljubljana SJ:Arctic/Longyearbyen ' +
  'SK:Europe/Bratislava SL:Africa/Freetown SM:Europe/San_Marino SN:Africa/Dakar SO:Africa/Mogadishu ' +
  'SR:America/Paramaribo SS:Africa/Juba ST:Africa/Sao_Tome SV:America/El_Salvador SX:America/Lower_Princes ' +
  'SY:Asia/Damascus SZ:Africa/Mbabane TC:America/Grand_Turk TD:Africa/Ndjamena TF:Indian/Kerguelen ' +
  'TG:Africa/Lome TH:Asia/Bangkok TJ:Asia/Dushanbe TK:Pacific/Fakaofo TL:Asia/Dili TM:Asia/Ashgabat ' +
  'TN:Africa/Tunis TO:Pacific/Tongatapu TR:Europe/Istanbul TT:America/Port_of_Spain TV:Pacific/Funafuti ' +
  'TW:Asia/Taipei TZ:Africa/Dar_es_Salaam UA:Europe/Kyiv|Europe/Simferopol UG:Africa/Kampala ' +
  'UM:Pacific/Midway|Pacific/Wake ' +
  'US:America/Adak|America/Anchorage|America/Boise|America/Chicago|America/Denver|America/Detroit|America/Indiana/Indianapolis|America/Indiana/Knox|America/Indiana/Marengo|America/Indiana/Petersburg|America/Indiana/Tell_City|America/Indiana/Vevay|America/Indiana/Vincennes|America/Indiana/Winamac|America/Juneau|America/Kentucky/Louisville|America/Kentucky/Monticello|America/Los_Angeles|America/Menominee|America/Metlakatla|America/New_York|America/Nome|America/North_Dakota/Beulah|America/North_Dakota/Center|America/North_Dakota/New_Salem|America/Phoenix|America/Sitka|America/Yakutat|Pacific/Honolulu ' +
  'UY:America/Montevideo UZ:Asia/Samarkand|Asia/Tashkent VA:Europe/Vatican VC:America/St_Vincent ' +
  'VE:America/Caracas VG:America/Tortola VI:America/St_Thomas VN:Asia/Ho_Chi_Minh VU:Pacific/Efate ' +
  'WF:Pacific/Wallis WS:Pacific/Apia YE:Asia/Aden YT:Indian/Mayotte ZA:Africa/Johannesburg ZM:Africa/Lusaka ' +
  'ZW:Africa/Harare ';

// Anciens noms encore renvoyés par des Android d'entrée de gamme. Node en canonicalise une partie
// (US/Eastern), pas ceux-là : sans cette liste, une personne en Inde repartirait sur le pays par défaut.
const ALIAS = {
  'asia/calcutta': 'IN', 'asia/saigon': 'VN', 'asia/rangoon': 'MM', 'asia/katmandu': 'NP',
  'asia/dacca': 'BD', 'asia/thimbu': 'BT', 'asia/ujung_pandang': 'ID', 'asia/istanbul': 'TR',
  'europe/kiev': 'UA', 'europe/uzhgorod': 'UA', 'europe/zaporozhye': 'UA', 'europe/nicosia': 'CY',
  'america/buenos_aires': 'AR', 'america/cordoba': 'AR', 'america/mendoza': 'AR',
  'america/godthab': 'GL', 'america/atka': 'US', 'america/ensenada': 'MX',
  'africa/asmera': 'ER', 'africa/timbuktu': 'ML', 'atlantic/faeroe': 'FO',
  'pacific/ponape': 'FM', 'pacific/truk': 'FM', 'pacific/samoa': 'AS',
  'australia/canberra': 'AU', 'australia/north': 'AU', 'australia/south': 'AU', 'australia/west': 'AU',
};

const PAYS_PAR_FUSEAU = new Map(Object.entries(ALIAS));
for (const bloc of FUSEAUX.split(' ')) {
  if (!bloc) continue;
  const [pays, zones] = bloc.split(':');
  for (const z of zones.split('|')) PAYS_PAR_FUSEAU.set(z.toLowerCase(), pays);
}

// Un fuseau inconnu, bricolé ou absent ne vaut pas une erreur : on renvoie null et l'appelant
// garde son pays par défaut. Le fuseau n'est jamais stocké, il sert à préremplir puis il est oublié.
export function paysDuFuseau(tz) {
  const cle = String(tz || '').trim().toLowerCase();
  if (!cle || cle.length > 60) return null;
  const pays = PAYS_PAR_FUSEAU.get(cle);
  return pays && estPays(pays) ? pays : null;
}
