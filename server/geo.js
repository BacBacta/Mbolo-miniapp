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
