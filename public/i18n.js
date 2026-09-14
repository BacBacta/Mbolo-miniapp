// Internationalisation de l'interface.
//
// La clé de traduction est la phrase française elle-même. Trois conséquences voulues :
// une clé oubliée retombe sur du français lisible et jamais sur un identifiant technique ;
// le code reste lisible sans aller-retour vers un fichier de clés ; et le français, langue
// source, ne coûte aucun téléchargement.
//
// Les autres langues sont chargées à la demande, une seule fois, avec la même empreinte de
// version que app.js pour qu'un cache ne serve jamais un dictionnaire périmé.

// Chaque langue est nommée dans sa propre langue : quelqu'un qui ne lit pas le français doit
// reconnaître la sienne dans la liste sans avoir à la traduire.
export const LANGUES = {
  fr: 'Français', en: 'English', es: 'Español', pt: 'Português', sw: 'Kiswahili',
  ru: 'Русский', uk: 'Українська',
};
export const LANGUE_SOURCE = 'fr';

// Fraunces, la police des titres, est latine : elle n'a pas de glyphes cyrilliques. Sans rien,
// chaque titre en russe et en ukrainien tombe sur Georgia pendant que le corps de texte reste en
// Manrope, qui les a — deux dessins de lettres dans la même phrase, au moment précis où l'app
// cherche à se faire reconnaître. Playfair Display tient le même rôle de sérif de titrage à fort
// contraste et couvre le cyrillique ; styles.css la pose sur :lang(ru) et :lang(uk).
//
// Elle est demandée ici, par la langue qui en a besoin, et pas dans index.html : qui lit en
// français, en anglais, en espagnol, en portugais ou en swahili n'en télécharge pas un octet
// (règle 15). Un test refuse qu'elle parte chez quelqu'un qui n'en verra jamais un caractère.
const DISPLAY_CYRILLIQUE = new Set(['ru', 'uk']);
const POLICE_CYRILLIQUE = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..600&display=swap';

function chargerPoliceCyrillique() {
  if (document.getElementById('police-cyrillique')) return;
  document.head.append(Object.assign(document.createElement('link'),
    { id: 'police-cyrillique', rel: 'stylesheet', href: POLICE_CYRILLIQUE }));
}

const dictionnaires = { fr: {} };
let courante = LANGUE_SOURCE;

export const langue = () => courante;

// Charge le dictionnaire d'une langue, puis l'active. Le français n'en a pas besoin.
export async function chargerLangue(code) {
  const c = LANGUES[code] ? code : LANGUE_SOURCE;
  if (!dictionnaires[c]) {
    try {
      // Même ?v= que app.js : l'empreinte du contenu suit le dictionnaire
      const version = new URL(import.meta.url).search;
      const mod = await import(`./i18n/${c}.js${version}`);
      dictionnaires[c] = mod.default || {};
    } catch {
      // Dictionnaire injoignable : on reste en français plutôt que d'afficher des trous
      dictionnaires[c] = {};
    }
  }
  courante = c;
  document.documentElement.lang = c;
  if (DISPLAY_CYRILLIQUE.has(c)) chargerPoliceCyrillique();
  return c;
}

function remplacer(s, vars) {
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}

// t('Ta limite du jour est atteinte')
// t('Il te reste {n} profils', { n: 4 })
export function t(cle, vars) {
  const valeur = dictionnaires[courante]?.[cle];
  return remplacer(typeof valeur === 'string' ? valeur : cle, vars);
}

// Pluriel.
//
// Cinq des sept langues ne distinguent que un et plusieurs : le français, l'anglais, l'espagnol,
// le portugais et le swahili. L'appel reflète cette langue source : tn('{n} restant',
// '{n} restants', n). Mais le russe et l'ukrainien en distinguent quatre — один профиль, два профиля, пять профилей, puis vingt et un профиль qui revient à la
// première forme. Deux clés françaises ne peuvent donc pas porter quatre formes russes.
//
// La traduction d'une phrase comptée est donc un objet plutôt qu'une chaîne, posé sous la clé
// du pluriel français, et dont les propriétés sont les catégories d'Intl.PluralRules :
//
//   '{n} restants': { one: '{n} остался', few: '{n} осталось', many: '{n} осталось', other: '…' }
//
// Une chaîne toute simple reste valable : c'est ce que font l'anglais et toute langue à deux
// formes, et c'est aussi le repli si le navigateur ne connaît pas Intl.PluralRules — un Android
// d'entrée de gamme très ancien afficherait alors un pluriel approximatif, jamais un trou.
const regles = new Map();
function categorie(code, n) {
  if (!regles.has(code)) {
    try {
      regles.set(code, new Intl.PluralRules(code));
    } catch {
      regles.set(code, null);
    }
  }
  const r = regles.get(code);
  try {
    return r ? r.select(n) : n > 1 ? 'other' : 'one';
  } catch {
    return n > 1 ? 'other' : 'one';
  }
}

export function tn(un, plusieurs, n, vars) {
  const formes = dictionnaires[courante]?.[plusieurs];
  if (formes && typeof formes === 'object') {
    const forme = formes[categorie(courante, n)] ?? formes.other ?? plusieurs;
    return remplacer(forme, { n, ...vars });
  }
  return t(n > 1 ? plusieurs : un, { n, ...vars });
}
