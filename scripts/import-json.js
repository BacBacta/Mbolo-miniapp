// Reprend le contenu de db.json et l'écrit dans PostgreSQL, une fois, au moment de la bascule.
//
//   $env:DATABASE_URL="postgres://..."; node scripts/import-json.js "data/db.json"
//
// Tout ce que porte db.json passe ici, y compris les événements de mesure : ils ne se
// reconstituent pas, les oublier à la bascule reviendrait à effacer l'entonnoir pour toujours.
//
// Le script est sûr à relancer : chaque ligne est écrite avec « on conflict do nothing », donc
// une reprise après coupure ne crée pas de doublon et n'écrase rien de ce qui a déjà bougé dans
// PostgreSQL. Il refuse de partir si les tables portent déjà des comptes, sauf avec --force :
// réimporter une vieille sauvegarde par-dessus une base vivante ferait plus de mal que de bien.
//
// Les photos et les selfies ne passent pas par ici : ce sont des fichiers dans DATA_DIR/uploads,
// à copier tels quels vers le volume de la nouvelle machine.
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { config } from '../server/config.js';
import { migrer } from '../server/db/migrate.js';

const force = process.argv.includes('--force');
const source = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(config.dataDir, 'db.json');

if (!config.databaseUrl) {
  console.error('DATABASE_URL manquant : c\'est la base d\'arrivée. Rien n\'a été importé.');
  process.exit(2);
}
if (!fs.existsSync(source)) {
  console.error(`Fichier introuvable : ${source}. Rien n'a été importé.`);
  process.exit(2);
}

const db = JSON.parse(fs.readFileSync(source, 'utf8'));
const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  ssl: /\bsslmode=(require|prefer)\b/.test(config.databaseUrl) ? { rejectUnauthorized: false } : false,
  max: 1,
  ...(config.databaseSchema ? { options: `-c search_path=${config.databaseSchema}` } : {}),
});

await migrer(pool, (m) => console.error(m), config.databaseSchema);

const { rows: [{ n }] } = await pool.query('select count(*)::int as n from users');
if (n && !force) {
  console.error(`La base contient déjà ${n} compte(s). Relance avec --force si tu veux vraiment compléter cet import.`);
  await pool.end();
  process.exit(1);
}

const pairKey = (a, b) => [String(a), String(b)].sort().join(':');
let total = 0;

async function ecrire(libelle, lignes, sql, valeurs) {
  let ecrites = 0;
  for (const ligne of lignes) {
    const r = await pool.query(sql, valeurs(ligne));
    ecrites += r.rowCount;
  }
  total += ecrites;
  console.log(`${libelle} : ${ecrites} importé(s) sur ${lignes.length}`);
}

// Les comptes d'abord : tout le reste les désigne.
await ecrire('Comptes', Object.values(db.users || {}),
  'insert into users (id, data, created_at) values ($1, $2::jsonb, $3) on conflict (id) do nothing',
  (u) => {
    const { id, createdAt, ...data } = u;
    return [String(id), JSON.stringify(data), Number(createdAt) || Date.now()];
  });

await ecrire('Balayages', db.swipes || [],
  'insert into swipes (from_id, to_id, action, at) values ($1, $2, $3, $4) on conflict (from_id, to_id) do nothing',
  (s) => [String(s.from), String(s.to), s.action, Number(s.at) || Date.now()]);

await ecrire('Matchs', Object.values(db.matches || {}),
  `insert into matches (id, pair_key, user_a, user_b, created_at, read_at)
   values ($1, $2, $3, $4, $5, $6::jsonb) on conflict (id) do nothing`,
  (m) => [m.id, m.key || pairKey(m.users[0], m.users[1]), String(m.users[0]), String(m.users[1]),
    Number(m.createdAt) || Date.now(), JSON.stringify(m.readAt || {})]);

// Les messages sont rangés par match dans le fichier : on les remet à plat.
const messages = Object.entries(db.messages || {}).flatMap(([matchId, liste]) => (liste || []).map((x) => ({ ...x, matchId })));
await ecrire('Messages', messages,
  'insert into messages (id, match_id, from_id, text, at) values ($1, $2, $3, $4, $5) on conflict (id) do nothing',
  (x) => [x.id, x.matchId, String(x.from), x.text, Number(x.at) || Date.now()]);

await ecrire('Blocages', db.blocks || [],
  'insert into blocks (from_id, to_id, at) values ($1, $2, $3) on conflict (from_id, to_id) do nothing',
  (b) => [String(b.from), String(b.to), Number(b.at) || Date.now()]);

await ecrire('Signalements', db.reports || [],
  'insert into reports (id, data, at) values ($1, $2::jsonb, $3) on conflict (id) do nothing',
  (r) => {
    const { id, at, ...data } = r;
    return [id, JSON.stringify(data), Number(at) || Date.now()];
  });

await ecrire('Rendez-vous', Object.values(db.dates || {}),
  'insert into dates (id, match_id, data) values ($1, $2, $3::jsonb) on conflict (id) do nothing',
  (d) => {
    const { id, matchId, ...data } = d;
    return [id, matchId, JSON.stringify(data)];
  });

// Les événements de mesure en dernier, et surtout pas oubliés : ce sont les seules données que
// personne ne peut reconstituer. Un compte se réinscrit, un message se réécrit ; un entonnoir
// d'inscription de la semaine dernière, non. Les oublier ici, c'est les perdre à la bascule.
await ecrire('Événements de mesure', db.events || [],
  'insert into events (id, u, k, at, p) values ($1, $2, $3, $4, $5::jsonb) on conflict (id) do nothing',
  (e) => [e.id, e.u === undefined || e.u === null ? null : String(e.u), e.k, Number(e.at) || Date.now(), e.p ? JSON.stringify(e.p) : null]);

await pool.end();
console.log(`\nImport terminé : ${total} ligne(s) écrite(s) depuis ${source}.`);
console.log('Pense à copier le dossier des photos (DATA_DIR/uploads) vers le volume de la nouvelle machine.');
