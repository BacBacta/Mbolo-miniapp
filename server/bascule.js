// Ce que la bascule vers PostgreSQL doit retrouver de l'autre côté.
//
// Fonction pure : elle ne lit ni fichier ni base. `scripts/etat-stockage.js` lui donne le contenu
// de db.json d'un côté, les comptes lus dans PostgreSQL de l'autre, et elle dit ce qui manque.
//
// Compter les lignes de db.json ne suffit pas. Chaque table se dédoublonne à l'écriture
// (« on conflict ... do nothing ») : un db.json qui porte deux fois le même balayage n'écrira
// qu'une ligne, et une comparaison naïve annoncerait une perte qui n'existe pas — puis ferait
// renoncer à une bascule qui allait bien. On compte donc, de chaque côté, ce que la table sait
// distinguer : sa clé de conflit, et rien d'autre.
//
// Les photos et les selfies ne sont pas ici : ce sont des fichiers de DATA_DIR/uploads, qui
// restent sur le volume et ne traversent jamais la base.

// La clé que chaque table refuse de voir deux fois (voir scripts/import-json.js et
// server/db/migrations/). Se tromper ici, c'est compter faux des deux côtés à la fois.
const PAR_PAIRE = (x) => `${x.from}:${x.to}`;
const PAR_ID = (x) => String(x.id);

export const TABLES = ['users', 'swipes', 'matches', 'messages', 'blocks', 'reports', 'dates', 'events'];

const liste = (v) => (Array.isArray(v) ? v : Object.values(v || {}));
const distincts = (v, cle) => new Set(liste(v).map(cle)).size;

// Les messages sont rangés par match dans le fichier ; à plat dans la base.
const tousLesMessages = (db) => Object.values(db.messages || {}).flatMap((l) => l || []);

export function attendu(db = {}) {
  return {
    users: distincts(db.users, PAR_ID),
    swipes: distincts(db.swipes, PAR_PAIRE),
    matches: distincts(db.matches, PAR_ID),
    messages: distincts(tousLesMessages(db), PAR_ID),
    blocks: distincts(db.blocks, PAR_PAIRE),
    reports: distincts(db.reports, PAR_ID),
    dates: distincts(db.dates, PAR_ID),
    events: distincts(db.events, PAR_ID),
  };
}

// `reels` : ce que PostgreSQL compte vraiment, table par table.
// Une table peut en porter *plus* que le fichier — l'app a continué de vivre entre l'import et la
// vérification, et c'est normal. Ce qui n'est jamais normal, c'est qu'elle en porte moins.
export function comparer(attendus, reels) {
  const lignes = TABLES.map((table) => ({
    table,
    json: attendus[table] || 0,
    pg: reels[table] || 0,
  }));
  return { lignes, manquantes: lignes.filter((l) => l.pg < l.json) };
}
