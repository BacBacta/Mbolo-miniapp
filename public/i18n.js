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

// Fraunces, la police des titres, n'a pas de glyphes cyrilliques : en russe et en ukrainien,
// chaque titre retomberait sur Georgia — une autre police, donc une autre identité, au moment
// précis où l'app veut se faire reconnaître. Playfair Display tient le même rôle (sérif de
// titrage à fort contraste) et couvre le cyrillique ; styles.css la pose sur :lang(ru) et
// :lang(uk). Elle n'est demandée qu'ici, par la langue qui en a besoin : qui lit en français,
// en anglais ou en swahili ne la télécharge jamais.
const DISPLAY_CYRILLIQUE = new Set(['ru', 'uk']);
const POLICE_CYRILLIQUE = 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400..600&display=swap';

function chargerPoliceCyrillique() {
  if (document.getElementById('police-cyrillique')) return;
  const lien = Object.assign(document.createElement('link'),
    { id: 'police-cyrillique', rel: 'stylesheet', href: POLICE_CYRILLIQUE });
  document.head.append(lien);
}
export const LANGUE_SOURCE = 'fr';

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

const remplacer = (s, vars) => {
  if (!vars) return s;
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
};

// t('Ta limite du jour est atteinte')
// t('Il te reste {n} profils', { n: 4 })
export function t(cle, vars) {
  const trad = dictionnaires[courante]?.[cle];
  // Une traduction peut être un objet : les formes plurielles d'une langue qui en a plus de
  // deux (voir tn). Seul tn sait les lire ; ailleurs on rend le français plutôt qu'un
  // « [object Object] » à l'écran.
  return remplacer(typeof trad === 'string' ? trad : cle, vars);
}

// Pluriel.
//
// Le français, l'anglais, l'espagnol, le portugais et le swahili distinguent deux formes, et
// « plus grand que un » suffit à choisir. Le russe et l'ukrainien en ont trois, et la règle ne
// porte pas sur la taille du nombre mais sur ses deux derniers chiffres : 1 профіль,
// 2 профілі, 5 профілів — et 21 профіль repasse au singulier. Aucun découpage en deux formes
// ne peut rendre ça.
//
// Une traduction peut donc être un objet dont les clés sont les catégories d'Intl.PluralRules
// (one, few, many, other). Quand il y en a un, c'est lui qui décide, et le choix fait par le
// français est ignoré : il serait faux une fois sur deux. Les deux clés françaises pointent
// vers le même objet dans le dictionnaire, si bien qu'aucune des deux ne peut dériver de
// l'autre — et un test le vérifie.
export function tn(un, plusieurs, n, vars) {
  const dico = dictionnaires[courante];
  const formes = [un, plusieurs].map((c) => dico?.[c]).find((v) => v && typeof v === 'object');
  if (formes && typeof Intl?.PluralRules === 'function') {
    const categorie = new Intl.PluralRules(courante).select(n);
    const forme = formes[categorie] ?? formes.other ?? formes.many;
    if (forme) return remplacer(forme, { n, ...vars });
  }
  return t(n > 1 ? plusieurs : un, { n, ...vars });
}
