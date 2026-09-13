// Un seul fichier d'instructions, et un mécanisme pour que ça le reste.
//
// `AGENTS.md` a été une copie de `CLAUDE.md`. Elle a divergé sans que personne le remarque :
// figée au 11 septembre, elle décrivait un dépôt sans voix, sans jauge, sans compatibilité et
// sans PostgreSQL. Un agent qui la lisait travaillait sur de fausses informations — et rien, dans
// le dépôt, ne pouvait le signaler.
//
// Recopier `CLAUDE.md` dans `AGENTS.md` est un geste tentant : il rend les deux fichiers vrais
// pendant une journée. Ce test le refuse, parce que c'est exactement comme ça que la divergence
// a commencé.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const racine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const lire = (f) => fs.readFileSync(path.join(racine, f), 'utf8');

test('AGENTS.md renvoie vers CLAUDE.md au lieu de le recopier', () => {
  const agents = lire('AGENTS.md');
  assert.match(agents, /CLAUDE\.md/, 'il doit dire où sont les instructions');
  // Un renvoi tient en une page. Au-delà, c'est que quelqu'un a recommencé à y écrire des
  // instructions — le seuil est large exprès : ce n'est pas la longueur qu'on surveille, c'est
  // la duplication.
  assert.ok(agents.length < 4000, `AGENTS.md fait ${agents.length} caractères : un renvoi, pas un second jeu d'instructions`);
});

test('les deux fichiers ne décrivent pas la même chose deux fois', () => {
  const agents = lire('AGENTS.md');
  const claude = lire('CLAUDE.md');

  // Les titres de section de CLAUDE.md sont ce qu'une copie emporte en premier. S'ils
  // réapparaissent dans AGENTS.md, c'est qu'on a dupliqué plutôt que renvoyé.
  const sections = [...claude.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
  assert.ok(sections.length > 5, 'CLAUDE.md doit bien avoir des sections, sinon ce test ne vérifie rien');
  const reprises = sections.filter((s) => agents.includes(s));
  assert.deepEqual(reprises, [], `AGENTS.md reprend des sections de CLAUDE.md : ${reprises.join(', ')}`);
});

// L'arborescence de la section 3 est une liste de fichiers, et une liste de fichiers se périme.
// `server/assets.js` y a manqué pendant un jour sans que rien ne le signale : un agent qui lisait
// CLAUDE.md pour savoir où vit le versionnement des fichiers statiques ne trouvait rien.
//
// Ce test ne juge pas les descriptions — seulement que la liste et le dossier disent les mêmes
// noms. C'est tout ce qu'une machine peut vérifier ici, et c'est ce qui se périme le plus vite.
test("l'arborescence de CLAUDE.md nomme exactement les fichiers de server/", () => {
  const claude = lire('CLAUDE.md');
  // Le bloc entre « server/ » et « public/ » dans le pavé de la section 3.
  const bloc = claude.split(/^server\/$/m)[1]?.split(/^public\/$/m)[0];
  assert.ok(bloc, 'la section 3 doit contenir un bloc server/ suivi d\'un bloc public/');

  const listes = [...bloc.matchAll(/^ {2}([a-z0-9.]+\.js)/gm)].map((m) => m[1]).sort();
  const reels = fs.readdirSync(path.join(racine, 'server')).filter((f) => f.endsWith('.js')).sort();

  const oublies = reels.filter((f) => !listes.includes(f));
  const fantomes = listes.filter((f) => !reels.includes(f));
  assert.deepEqual(oublies, [], `présents dans server/ mais absents de CLAUDE.md : ${oublies.join(', ')}`);
  assert.deepEqual(fantomes, [], `annoncés par CLAUDE.md mais absents de server/ : ${fantomes.join(', ')}`);
});
