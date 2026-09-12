// Internationalisation de l'interface.
//
// La clé de traduction est la phrase française elle-même. Trois conséquences voulues :
// une clé oubliée retombe sur du français lisible et jamais sur un identifiant technique ;
// le code reste lisible sans aller-retour vers un fichier de clés ; et le français, langue
// source, ne coûte aucun téléchargement.
//
// Les autres langues sont chargées à la demande, une seule fois, avec la même empreinte de
// version que app.js pour qu'un cache ne serve jamais un dictionnaire périmé.

export const LANGUES = { fr: 'Français', en: 'English' };
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
  return c;
}

// t('Ta limite du jour est atteinte')
// t('Il te reste {n} profils', { n: 4 })
export function t(cle, vars) {
  let s = dictionnaires[courante]?.[cle] ?? cle;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
}

// Pluriel. Les deux langues visées distinguent seulement un et plusieurs ; une langue à
// pluriels multiples demanderait Intl.PluralRules, qui s'insérerait ici sans rien changer ailleurs.
export function tn(un, plusieurs, n, vars) {
  return t(n > 1 ? plusieurs : un, { n, ...vars });
}
